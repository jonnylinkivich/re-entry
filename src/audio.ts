let ctx: AudioContext | null = null;
let muted = false;
let sfxPlayed = 0;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function unlockAudio(): void {
  if (muted) return;
  if (ctx?.state === "running") return;
  const a = audio();
  if (a && a.state === "suspended") void a.resume();
}

export function setMuted(value: boolean): void {
  if (muted === value) return;
  muted = value;
  applyMute();
}

export function toggleMuted(): boolean {
  muted = !muted;
  applyMute();
  return muted;
}

function applyMute(): void {
  setSfxOpen(!muted);
  bedSig = "";
  setMusicBed(bed);
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Neon arcade bed. One looping buffer (no files, no per-frame oscillators).
 * Pause / shop / cine / game over duck the bed.
 * Shot, hull, beacon, shop, and void-fold one-shots stay under this bed and do not duck:
 * the shop confirm has to read while the bed is already pulled down.
 * One-shot peaks stay under the play bed (MUSIC_PLAY × BED_PEAK ≈ 0.01).
 * Square reads hotter than sine, so the shot tick sits a notch lower.
 */
const SHOT_GAIN = 0.0065;
const HIT_GAIN = 0.0055;
const BEACON_GAIN = 0.0055;
const BUY_GAIN = 0.0046;
const FOLD_GAIN = 0.0052;
const MUSIC_PLAY = 0.012;
const MUSIC_SOFT = 0.004;
const BED_PEAK = 0.8;
const BED_BPM = 96;
const BED_EIGHTH = 60 / BED_BPM / 2;
const BED_STEPS = 32;
const BED_SECONDS = BED_EIGHTH * BED_STEPS;

type MusicBed = "off" | "play" | "soft";
type ToneShape = "sine" | "soft" | "tri";

type MusicGraph = {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  seconds: number;
  peak: number;
  edge: number;
};

let bed: MusicBed = "off";
let bedSig = "";
let gainNow = 0;
let music: MusicGraph | null = null;
let probe: AnalyserNode | null = null;
let probeSamples: Float32Array<ArrayBuffer> | null = null;
let musicError = false;
let sfxBus: GainNode | null = null;

function sfxOut(a: AudioContext): GainNode {
  if (!sfxBus) {
    sfxBus = a.createGain();
    sfxBus.gain.value = muted ? 0 : 1;
    sfxBus.connect(a.destination);
  }
  return sfxBus;
}

/** Mute cuts in-flight one-shots on the same gate as the bed. */
function setSfxOpen(open: boolean): void {
  if (!sfxBus || !ctx) return;
  const now = ctx.currentTime;
  const param = sfxBus.gain;
  param.cancelScheduledValues(now);
  param.setValueAtTime(open ? 1 : 0, now);
}

export function setMusicBed(next: MusicBed): void {
  bed = next;
  const nextSig = `${muted ? 1 : 0}:${bed}`;
  if (nextSig === bedSig) return;
  try {
    applyBed();
    bedSig = nextSig;
  } catch (err) {
    bedSig = "";
    if (!musicError) {
      musicError = true;
      console.error("RE-ENTRY music", err);
    }
  }
}

export function audioSnapshot(): {
  muted: boolean;
  bed: MusicBed;
  gain: number;
  play: number;
  soft: number;
  peak: number;
  edge: number;
  looping: boolean;
  seconds: number;
  rms: number;
  sfx: number;
  state: AudioContextState | "none";
  time: number;
} {
  return {
    muted,
    bed,
    gain: gainNow,
    play: MUSIC_PLAY,
    soft: MUSIC_SOFT,
    peak: music?.peak ?? 0,
    edge: music?.edge ?? 0,
    looping: music != null,
    seconds: music?.seconds ?? 0,
    rms: musicRms(),
    sfx: sfxPlayed,
    state: ctx?.state ?? "none",
    time: ctx?.currentTime ?? 0,
  };
}

function applyBed(): void {
  if (bed === "off") {
    stopMusic();
    gainNow = 0;
    return;
  }
  if (muted) {
    if (music) rampMusic(0);
    else gainNow = 0;
    return;
  }
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume();
  if (!music) startMusic(a);
  rampMusic(bed === "soft" ? MUSIC_SOFT : MUSIC_PLAY);
}

function rampMusic(target: number): void {
  if (!music || !ctx) {
    gainNow = target;
    return;
  }
  const from = gainNow;
  const seconds = target === from ? 0.02 : target === 0 ? 0.04 : from === 0 ? 0.5 : 0.28;
  const param = music.gain.gain;
  const now = ctx.currentTime;
  if (typeof param.cancelAndHoldAtTime === "function") param.cancelAndHoldAtTime(now);
  else {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
  }
  param.linearRampToValueAtTime(target, now + seconds);
  gainNow = target;
}

function startMusic(a: AudioContext): void {
  const rendered = renderBed(Math.min(a.sampleRate, 32000));
  const buffer = a.createBuffer(1, rendered.samples.length, rendered.rate);
  buffer.getChannelData(0).set(rendered.samples);
  const source = a.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1600;
  filter.Q.value = 0.5;
  const gain = a.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(a.destination);
  source.start();
  music = {
    source,
    filter,
    gain,
    seconds: buffer.duration,
    peak: rendered.peak,
    edge: rendered.edge,
  };
  gainNow = 0;
}

function stopMusic(): void {
  if (!music) return;
  try {
    music.source.stop();
  } catch {
    /* already stopped */
  }
  music.source.disconnect();
  music.filter.disconnect();
  music.gain.disconnect();
  probe?.disconnect();
  probe = null;
  probeSamples = null;
  music = null;
}

function musicRms(): number {
  if (!music || !ctx || ctx.state !== "running") return 0;
  if (!probe || !probeSamples) {
    probe = ctx.createAnalyser();
    probe.fftSize = 2048;
    probeSamples = new Float32Array(probe.fftSize);
    music.gain.connect(probe);
  }
  const samples = probeSamples;
  probe.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}

function renderBed(rate: number): { samples: Float32Array; rate: number; peak: number; edge: number } {
  const length = Math.max(1, Math.round(BED_SECONDS * rate));
  const data = new Float32Array(length);
  const eighth = BED_EIGHTH;
  const notes: Array<[number, number, number, number, ToneShape, number]> = [
    // Bass octave pair, one chord per bar: Am Am F G.
    [0, 110, 2.36, 0.22, "sine", 0.45],
    [0, 220, 2.36, 0.42, "sine", 0.4],
    [8, 110, 2.36, 0.22, "sine", 0.45],
    [8, 220, 2.36, 0.42, "sine", 0.4],
    [16, 87.31, 2.36, 0.2, "sine", 0.45],
    [16, 174.61, 2.36, 0.4, "sine", 0.4],
    [24, 98, 2.36, 0.2, "sine", 0.45],
    [24, 196, 2.36, 0.4, "sine", 0.4],
    // Quiet triads so the changes read without a drum machine.
    [0, 261.63, 1.2, 0.07, "tri", 1.1],
    [0, 329.63, 1.2, 0.06, "tri", 1.1],
    [8, 261.63, 1.2, 0.07, "tri", 1.1],
    [8, 329.63, 1.2, 0.06, "tri", 1.1],
    [16, 220, 1.2, 0.07, "tri", 1.1],
    [16, 261.63, 1.2, 0.06, "tri", 1.1],
    [24, 246.94, 1.2, 0.07, "tri", 1.1],
    [24, 293.66, 1.2, 0.06, "tri", 1.1],
    // Sparse arp on the offbeats.
    [2, 329.63, 0.24, 0.16, "soft", 6],
    [5, 440, 0.22, 0.14, "soft", 6],
    [10, 293.66, 0.24, 0.15, "soft", 6],
    [13, 392, 0.22, 0.13, "soft", 6],
    [18, 261.63, 0.24, 0.15, "soft", 6],
    [21, 440, 0.22, 0.12, "soft", 6],
    [26, 293.66, 0.24, 0.15, "soft", 6],
    [29, 392, 0.22, 0.13, "soft", 6],
    // Two short pings. Kept tiny so they sit under the shot attack.
    [0, 659.25, 0.08, 0.04, "sine", 10],
    [16, 523.25, 0.08, 0.035, "sine", 10],
  ];
  for (const [step, freq, dur, amp, shape, decay] of notes) {
    addTone(data, rate, step * eighth, freq, dur, amp, shape, decay);
  }
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  let scale = peak > 0.0001 ? BED_PEAK / peak : 0;
  if (scale * peak * MUSIC_PLAY >= 0.014) scale *= 0.014 / (scale * peak * MUSIC_PLAY);
  if (scale !== 1) {
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * scale;
  }
  const fadeN = Math.max(1, Math.floor(0.004 * rate));
  for (let i = 0; i < fadeN; i++) {
    const k = i / fadeN;
    data[i] = data[i]! * k;
    const j = data.length - 1 - i;
    data[j] = data[j]! * k;
  }
  peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  let edge = 0;
  const edgeN = Math.min(32, data.length);
  for (let i = 0; i < edgeN; i++) {
    edge = Math.max(edge, Math.abs(data[i]!), Math.abs(data[data.length - 1 - i]!));
  }
  return { samples: data, rate, peak, edge };
}

function addTone(
  data: Float32Array,
  rate: number,
  startSec: number,
  freq: number,
  dur: number,
  amp: number,
  shape: ToneShape,
  decay: number,
): void {
  const start = Math.floor(startSec * rate);
  const count = Math.floor(dur * rate);
  const attack = Math.max(1, Math.floor(0.018 * rate));
  const release = Math.max(1, Math.floor(Math.min(0.08, dur * 0.4) * rate));
  for (let i = 0; i < count; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= data.length) continue;
    let env = 1;
    if (i < attack) env = i / attack;
    const tail = count - i;
    if (tail < release) env *= tail / release;
    const t = i / rate;
    env *= Math.exp(-t * decay);
    const phase = 2 * Math.PI * freq * t;
    let sample: number;
    if (shape === "soft") {
      sample = Math.sin(phase) * 0.62 + Math.sin(phase * 3) * 0.22 + Math.sin(phase * 5) * 0.08;
    } else if (shape === "tri") {
      sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
    } else {
      sample = Math.sin(phase);
    }
    data[idx] = data[idx]! + sample * amp * env;
  }
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain = 0.06,
  slide?: number,
  delay = 0,
): void {
  const a = audio();
  if (!a) return;
  sfxPlayed += 1;
  const now = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), now + duration);
  }
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + duration);
  osc.connect(g).connect(sfxOut(a));
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function sfxShoot(): void {
  beep(920, 0.045, "square", SHOT_GAIN, 280);
}

export function sfxThrust(): void {
  beep(90, 0.05, "sawtooth", 0.015, 60);
}

export function sfxBoom(size: number): void {
  beep(140 + size * 40, 0.22, "sawtooth", 0.08, 50);
}

export function sfxHit(): void {
  beep(156, 0.1, "sine", HIT_GAIN, 52);
}

/** Scrap and sip beacons share one short collect ping. */
export function sfxBeacon(): void {
  beep(680, 0.085, "triangle", BEACON_GAIN, 1180);
}

/** Shop purchase confirm. Two soft sine ticks, still under the ducked bed. */
export function sfxBuy(): void {
  beep(523, 0.07, "sine", BUY_GAIN);
  beep(784, 0.09, "sine", BUY_GAIN * 0.8, undefined, 0.05);
}

/** Void-fold enter. Short falling sweep, not the re-entry cine sting. */
export function sfxFold(): void {
  beep(360, 0.16, "sine", FOLD_GAIN, 70);
  beep(900, 0.1, "triangle", FOLD_GAIN * 0.45, 200);
}

export function sfxPickup(): void {
  beep(520, 0.12, "triangle", 0.05, 980);
}

export function sfxWave(): void {
  beep(240, 0.18, "triangle", 0.045, 640);
}

export function sfxOver(): void {
  beep(220, 0.45, "sawtooth", 0.07, 70);
}

export function sfxRescue(): void {
  beep(180, 0.16, "triangle", 0.05, 520);
  beep(320, 0.28, "square", 0.04, 880);
}

export function sfxKey(): void {
  beep(392, 0.12, "square", 0.05, 784);
  beep(523, 0.18, "triangle", 0.045, 1046);
}

export function sfxShield(): void {
  beep(640, 0.08, "sine", 0.03, 420);
}

export function sfxBossHit(): void {
  beep(160, 0.16, "sawtooth", 0.06, 70);
}

export function sfxReentry(): void {
  const a = audio();
  if (!a) return;
  const out = sfxOut(a);
  const now = a.currentTime;
  const rumble = a.createOscillator();
  const rg = a.createGain();
  rumble.type = "sawtooth";
  rumble.frequency.setValueAtTime(96, now);
  rumble.frequency.exponentialRampToValueAtTime(38, now + 2.6);
  rg.gain.setValueAtTime(0.0008, now);
  rg.gain.exponentialRampToValueAtTime(0.07, now + 0.12);
  rg.gain.exponentialRampToValueAtTime(0.0008, now + 2.8);
  rumble.connect(rg).connect(out);
  rumble.start(now);
  rumble.stop(now + 2.85);

  const hiss = a.createOscillator();
  const hg = a.createGain();
  hiss.type = "square";
  hiss.frequency.setValueAtTime(1400, now + 0.4);
  hiss.frequency.exponentialRampToValueAtTime(220, now + 2.4);
  hg.gain.setValueAtTime(0.0008, now + 0.4);
  hg.gain.exponentialRampToValueAtTime(0.03, now + 0.55);
  hg.gain.exponentialRampToValueAtTime(0.0008, now + 2.5);
  hiss.connect(hg).connect(out);
  hiss.start(now + 0.4);
  hiss.stop(now + 2.55);

  const notes = [392, 330, 262, 196];
  notes.forEach((freq, i) => {
    const t = now + 0.15 + i * 0.42;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  });
}
