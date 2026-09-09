import "./style.css";
import { unlockAudio } from "./audio.ts";
import { Game, type HudSnapshot, type Mode } from "./game.ts";

function must<T extends Element>(value: T | null, id: string): T {
  if (!value) throw new Error(`RE-ENTRY failed to mount: missing ${id}.`);
  return value;
}

const canvas = must(document.querySelector<HTMLCanvasElement>("#game"), "#game");
const overlay = must(document.querySelector<HTMLElement>("#overlay"), "#overlay");
const hud = must(document.querySelector<HTMLElement>("#hud"), "#hud");
const scoreEl = must(document.querySelector<HTMLElement>("#score"), "#score");
const waveEl = must(document.querySelector<HTMLElement>("#wave"), "#wave");
const bestEl = must(document.querySelector<HTMLElement>("#best"), "#best");
const livesEl = must(document.querySelector<HTMLElement>("#lives"), "#lives");
const comboEl = must(document.querySelector<HTMLElement>("#combo"), "#combo");
const creditsEl = must(document.querySelector<HTMLElement>("#credits"), "#credits");
const loadoutEl = must(document.querySelector<HTMLElement>("#loadout"), "#loadout");
const finalScore = must(document.querySelector<HTMLElement>("#final-score"), "#final-score");
const finalCredits = must(document.querySelector<HTMLElement>("#final-credits"), "#final-credits");
const finalLine = must(document.querySelector<HTMLElement>("#final-line"), "#final-line");
const playBtn = must(document.querySelector<HTMLButtonElement>("#play"), "#play");
const resumeBtn = must(document.querySelector<HTMLButtonElement>("#resume"), "#resume");
const retryBtn = must(document.querySelector<HTMLButtonElement>("#retry"), "#retry");
const fireBtn = must(document.querySelector<HTMLButtonElement>("#fire"), "#fire");
const promptEl = must(document.querySelector<HTMLElement>("#prompt"), "#prompt");
const fuelWrap = must(document.querySelector<HTMLElement>("#fuel-wrap"), "#fuel-wrap");
const fuelBar = must(document.querySelector<HTMLElement>("#fuel-bar"), "#fuel-bar");
const energyWrap = must(document.querySelector<HTMLElement>("#energy-wrap"), "#energy-wrap");
const energyBar = must(document.querySelector<HTMLElement>("#energy-bar"), "#energy-bar");
const cargoWrap = must(document.querySelector<HTMLElement>("#cargo-wrap"), "#cargo-wrap");
const cargoEl = must(document.querySelector<HTMLElement>("#cargo"), "#cargo");
const objectiveEl = must(document.querySelector<HTMLElement>("#objective"), "#objective");

const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
if (!ctx) {
  showScreen("error");
  throw new Error("Canvas 2D is unavailable.");
}

const game = new Game();
const surface = canvas;
const gfx = ctx;

function showScreen(mode: Mode | "error"): void {
  const screens = overlay.querySelectorAll<HTMLElement>("[data-screen]");
  screens.forEach((node) => {
    node.hidden = node.dataset.screen !== mode;
  });
  overlay.hidden = mode === "play" || mode === "cine";
  hud.hidden = mode === "menu" || mode === "error" || mode === "cine";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  fireBtn.hidden = !(mode === "play" && coarse);
}

function renderHud(snapshot: HudSnapshot): void {
  scoreEl.textContent = String(snapshot.score);
  waveEl.textContent = snapshot.sector;
  bestEl.textContent = String(snapshot.high);
  creditsEl.textContent = String(snapshot.credits);
  finalScore.textContent = String(snapshot.score);
  finalCredits.textContent = String(snapshot.runCredits);
  finalLine.textContent = snapshot.finalLine;
  comboEl.hidden = snapshot.mode !== "play" || snapshot.combo < 2;
  comboEl.textContent = `x${snapshot.combo}`;
  loadoutEl.hidden = snapshot.loadout.length === 0;
  loadoutEl.replaceChildren();
  for (const tag of snapshot.loadout) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    loadoutEl.append(chip);
  }
  livesEl.replaceChildren();
  for (let i = 0; i < snapshot.maxLives; i++) {
    const pip = document.createElement("span");
    pip.className = i < snapshot.lives ? "life" : "life is-lost";
    livesEl.append(pip);
  }
  showScreen(snapshot.mode);
  syncLiveHud(snapshot);
}

function syncLiveHud(snapshot: HudSnapshot): void {
  const playing = snapshot.mode === "play";
  promptEl.hidden = !playing || snapshot.prompt.length === 0;
  promptEl.textContent = snapshot.prompt;
  objectiveEl.hidden = !playing || snapshot.objective.length === 0;
  objectiveEl.textContent = snapshot.objective;
  cargoWrap.hidden = !playing || snapshot.zone !== "cavern";
  cargoEl.textContent = String(snapshot.cargo);
  fuelWrap.hidden = !playing || snapshot.zone !== "cavern";
  const fuelPct = snapshot.maxFuel > 0 ? (snapshot.fuel / snapshot.maxFuel) * 100 : 0;
  fuelBar.style.width = `${clamp(fuelPct, 0, 100)}%`;
  energyWrap.hidden = !playing;
  const energyPct = snapshot.maxEnergy > 0 ? (snapshot.energy / snapshot.maxEnergy) * 100 : 0;
  energyBar.style.width = `${clamp(energyPct, 0, 100)}%`;
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

game.onHud = renderHud;
renderHud(game.hud());

function fit(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  surface.width = Math.floor(w * dpr);
  surface.height = Math.floor(h * dpr);
  surface.style.width = `${w}px`;
  surface.style.height = `${h}px`;
  gfx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.resize(w, h);
}

function canvasPoint(event: PointerEvent): { x: number; y: number } {
  const rect = surface.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function beginRun(): void {
  unlockAudio();
  game.start();
  playBtn.blur();
  retryBtn.blur();
}

playBtn.addEventListener("click", beginRun);
retryBtn.addEventListener("click", beginRun);
resumeBtn.addEventListener("click", () => {
  unlockAudio();
  game.resume();
  resumeBtn.blur();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "ArrowDown") event.preventDefault();
  if (event.repeat && (event.code === "Enter" || event.code === "Escape" || event.code === "KeyE")) return;
  unlockAudio();
  game.key(event.code, true);
});

window.addEventListener("keyup", (event) => {
  game.key(event.code, false);
});

let thrustingPointer = false;

surface.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  unlockAudio();
  surface.setPointerCapture(event.pointerId);
  thrustingPointer = true;
  const p = canvasPoint(event);
  game.setPointer(p.x, p.y, true);
  if (event.pointerType === "mouse") game.pulseFire();
});

surface.addEventListener("pointermove", (event) => {
  const p = canvasPoint(event);
  game.setPointer(p.x, p.y, thrustingPointer);
});

surface.addEventListener("pointerup", () => {
  thrustingPointer = false;
  game.clearPointer();
});

surface.addEventListener("pointercancel", () => {
  thrustingPointer = false;
  game.clearPointer();
});

surface.addEventListener("contextmenu", (event) => event.preventDefault());

surface.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    let dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 24;
    if (event.deltaMode === 2) dy *= 320;
    game.wheel(dy);
  },
  { passive: false },
);

fireBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  unlockAudio();
  game.setFire(true);
});

fireBtn.addEventListener("pointerup", () => game.setFire(false));
fireBtn.addEventListener("pointercancel", () => game.setFire(false));

window.addEventListener("blur", () => {
  thrustingPointer = false;
  game.clearPointer();
  game.setFire(false);
});

window.addEventListener("resize", fit);
fit();

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  game.update(dt);
  game.draw(gfx);
  syncLiveHud(game.hud());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
