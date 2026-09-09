let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function unlockAudio(): void {
  const a = audio();
  if (a && a.state === "suspended") void a.resume();
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function toggleMuted(): boolean {
  muted = !muted;
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

function beep(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain = 0.06,
  slide?: number,
): void {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slide !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), now + duration);
  }
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + duration);
  osc.connect(g).connect(a.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function sfxShoot(): void {
  beep(720, 0.07, "square", 0.04, 180);
}

export function sfxThrust(): void {
  beep(90, 0.05, "sawtooth", 0.015, 60);
}

export function sfxBoom(size: number): void {
  beep(140 + size * 40, 0.22, "sawtooth", 0.08, 50);
}

export function sfxHit(): void {
  beep(180, 0.28, "square", 0.07, 55);
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
  const now = a.currentTime;
  const rumble = a.createOscillator();
  const rg = a.createGain();
  rumble.type = "sawtooth";
  rumble.frequency.setValueAtTime(96, now);
  rumble.frequency.exponentialRampToValueAtTime(38, now + 2.6);
  rg.gain.setValueAtTime(0.0008, now);
  rg.gain.exponentialRampToValueAtTime(0.07, now + 0.12);
  rg.gain.exponentialRampToValueAtTime(0.0008, now + 2.8);
  rumble.connect(rg).connect(a.destination);
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
  hiss.connect(hg).connect(a.destination);
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
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.3);
  });
}
