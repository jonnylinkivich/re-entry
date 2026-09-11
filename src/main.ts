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
const shopLeaveBtn = must(document.querySelector<HTMLButtonElement>("#shop-leave"), "#shop-leave");
const shopCreditsEl = must(document.querySelector<HTMLElement>("#shop-credits"), "#shop-credits");
const shopListEl = must(document.querySelector<HTMLElement>("#shop-list"), "#shop-list");
const shopHintEl = must(document.querySelector<HTMLElement>("#shop-hint"), "#shop-hint");
const fireBtn = must(document.querySelector<HTMLButtonElement>("#fire"), "#fire");
const padsEl = must(document.querySelector<HTMLElement>("#pads"), "#pads");
const promptEl = must(document.querySelector<HTMLElement>("#prompt"), "#prompt");
const fuelWrap = must(document.querySelector<HTMLElement>("#fuel-wrap"), "#fuel-wrap");
const fuelBar = must(document.querySelector<HTMLElement>("#fuel-bar"), "#fuel-bar");
const energyWrap = must(document.querySelector<HTMLElement>("#energy-wrap"), "#energy-wrap");
const energyBar = must(document.querySelector<HTMLElement>("#energy-bar"), "#energy-bar");
const cargoWrap = must(document.querySelector<HTMLElement>("#cargo-wrap"), "#cargo-wrap");
const cargoEl = must(document.querySelector<HTMLElement>("#cargo"), "#cargo");
const objectiveEl = must(document.querySelector<HTMLElement>("#objective"), "#objective");

const ctx =
  canvas.getContext("2d", { alpha: false, desynchronized: true }) ??
  canvas.getContext("2d", { alpha: false }) ??
  canvas.getContext("2d");
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
  const hideOverlay = mode === "play" || mode === "cine";
  overlay.hidden = hideOverlay;
  // Hidden Begin/Retry can still eat Space if they keep focus. Inert drops them
  // out of the focus/activation tree so Space fires the gun instead.
  overlay.inert = hideOverlay;
  hud.hidden = mode === "menu" || mode === "error" || mode === "cine";
  // Always offer the flight keypad in play. Coarse pointers need it; desktop
  // was hiding it behind (pointer: fine), which looked like the pads never landed.
  const showPads = mode === "play";
  fireBtn.hidden = !showPads;
  padsEl.hidden = !showPads;
}

let hudLives = -1;
let hudMaxLives = -1;
let hudLoadoutKey = "";
let lastPrompt = "\0";
let lastObjective = "\0";
let lastCargo = -1;
let lastFuelW = "";
let lastEnergyW = "";
let lastSector = "";
let lastScore = -1;
let lastCredits = -1;

function renderLoadout(tags: readonly string[]): void {
  const key = tags.join("|");
  if (key === hudLoadoutKey) return;
  hudLoadoutKey = key;
  loadoutEl.hidden = tags.length === 0;
  loadoutEl.replaceChildren();
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    loadoutEl.append(chip);
  }
}

function renderLives(lives: number, maxLives: number): void {
  if (lives === hudLives && maxLives === hudMaxLives) return;
  hudLives = lives;
  hudMaxLives = maxLives;
  livesEl.replaceChildren();
  for (let i = 0; i < maxLives; i++) {
    const pip = document.createElement("span");
    pip.className = i < lives ? "life" : "life is-lost";
    livesEl.append(pip);
  }
}

function renderHud(snapshot: HudSnapshot): void {
  if (snapshot.score !== lastScore) {
    lastScore = snapshot.score;
    scoreEl.textContent = String(snapshot.score);
    finalScore.textContent = String(snapshot.score);
  }
  if (snapshot.sector !== lastSector) {
    lastSector = snapshot.sector;
    waveEl.textContent = snapshot.sector;
  }
  bestEl.textContent = String(snapshot.high);
  if (snapshot.credits !== lastCredits) {
    lastCredits = snapshot.credits;
    creditsEl.textContent = String(snapshot.credits);
    finalCredits.textContent = String(snapshot.runCredits);
  }
  finalLine.textContent = snapshot.finalLine;
  comboEl.hidden = snapshot.mode !== "play" || snapshot.combo < 2;
  comboEl.textContent = `x${snapshot.combo}`;
  renderLoadout(snapshot.loadout);
  renderLives(snapshot.lives, snapshot.maxLives);
  showScreen(snapshot.mode);
  if (snapshot.mode === "shop") renderShop(snapshot);
  syncLiveHud(snapshot);
}

function syncLiveHud(snapshot: HudSnapshot): void {
  const playing = snapshot.mode === "play";
  hud.hidden = snapshot.mode === "menu" || snapshot.mode === "cine";
  overlay.hidden = snapshot.mode === "play" || snapshot.mode === "cine";
  const hidePrompt = !playing || snapshot.prompt.length === 0;
  if (promptEl.hidden !== hidePrompt) promptEl.hidden = hidePrompt;
  if (snapshot.prompt !== lastPrompt) {
    lastPrompt = snapshot.prompt;
    promptEl.textContent = snapshot.prompt;
  }
  promptEl.classList.toggle("is-dock", snapshot.promptDock);
  const hideObj = !playing || snapshot.objective.length === 0;
  if (objectiveEl.hidden !== hideObj) objectiveEl.hidden = hideObj;
  if (snapshot.objective !== lastObjective) {
    lastObjective = snapshot.objective;
    objectiveEl.textContent = snapshot.objective;
  }
  cargoWrap.hidden = !playing || snapshot.zone !== "cavern";
  if (snapshot.cargo !== lastCargo) {
    lastCargo = snapshot.cargo;
    cargoEl.textContent = String(snapshot.cargo);
  }
  fuelWrap.hidden = !playing || snapshot.zone !== "cavern";
  const fuelPct = snapshot.maxFuel > 0 ? (snapshot.fuel / snapshot.maxFuel) * 100 : 0;
  const fuelW = `${clamp(fuelPct, 0, 100)}%`;
  if (fuelW !== lastFuelW) {
    lastFuelW = fuelW;
    fuelBar.style.width = fuelW;
  }
  energyWrap.hidden = !playing;
  const energyPct = snapshot.maxEnergy > 0 ? (snapshot.energy / snapshot.maxEnergy) * 100 : 0;
  const energyW = `${clamp(energyPct, 0, 100)}%`;
  if (energyW !== lastEnergyW) {
    lastEnergyW = energyW;
    energyBar.style.width = energyW;
  }
}

function renderShop(snapshot: HudSnapshot): void {
  shopCreditsEl.textContent = String(snapshot.credits);
  shopHintEl.hidden = snapshot.shopHint.length === 0;
  shopHintEl.textContent = snapshot.shopHint;
  shopListEl.replaceChildren();
  for (const row of snapshot.shopRows) {
    const li = document.createElement("li");
    li.className = "shop-row";
    const copy = document.createElement("div");
    copy.className = "shop-row-copy";
    const title = document.createElement("strong");
    title.textContent = row.name;
    const blurb = document.createElement("span");
    blurb.textContent = row.blurb;
    copy.append(title, blurb);
    const buyWrap = document.createElement("div");
    buyWrap.className = "shop-row-buy";
    const price = document.createElement("span");
    price.className = row.status === "broke" ? "shop-price is-miss" : "shop-price";
    price.textContent = row.detail;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shop-buy";
    btn.textContent = row.status === "ready" ? "Buy" : row.status === "broke" ? "Need CR" : row.status;
    btn.disabled = row.status !== "ready";
    btn.addEventListener("click", () => {
      game.buyShop(row.id);
      btn.blur();
      renderHud(game.hud());
    });
    buyWrap.append(price, btn);
    li.append(copy, buyWrap);
    shopListEl.append(li);
  }
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

function grabPlayFocus(): void {
  playBtn.blur();
  retryBtn.blur();
  resumeBtn.blur();
  shopLeaveBtn.blur();
  fireBtn.blur();
  for (const pad of padsEl.querySelectorAll<HTMLButtonElement>(".pad-btn")) pad.blur();
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== surface && active !== document.body) {
    active.blur();
  }
  window.focus();
  surface.focus({ preventScroll: true });
}

function grabPlayFocusSoon(): void {
  grabPlayFocus();
  // Keyboard-activated Begin/Retry can steal focus back after click. Grab again
  // on the next frames and a short timeout so WASD/Space work without a canvas click.
  requestAnimationFrame(() => {
    grabPlayFocus();
    requestAnimationFrame(grabPlayFocus);
  });
  window.setTimeout(grabPlayFocus, 0);
  window.setTimeout(grabPlayFocus, 50);
}

function beginRun(): void {
  unlockAudio();
  // Enter/Space on a focused Begin/Retry button fires keydown *and* click.
  // The first path already called start(); a second start() looks like a restart.
  if (game.mode === "play" || game.mode === "cine") {
    grabPlayFocusSoon();
    return;
  }
  game.start();
  grabPlayFocusSoon();
}

playBtn.addEventListener("click", beginRun);
retryBtn.addEventListener("click", beginRun);
resumeBtn.addEventListener("click", () => {
  unlockAudio();
  game.resume();
  grabPlayFocusSoon();
});
shopLeaveBtn.addEventListener("click", () => {
  game.closeShop();
  grabPlayFocusSoon();
});

function playingNow(): boolean {
  return game.mode === "play" || game.mode === "cine";
}

/** Remote / IME keydowns sometimes omit `code`. Map `key` so E/WASD still reach the game. */
function eventCode(event: KeyboardEvent): string {
  if (event.code && event.code !== "Unidentified") return event.code;
  const key = event.key;
  if (key === " ") return "Space";
  if (key === "Enter" || key === "Escape") return key;
  if (key === "Shift") return "ShiftLeft";
  if (key.length === 1) {
    const ch = key.toLowerCase();
    if (ch >= "a" && ch <= "z") return `Key${ch.toUpperCase()}`;
  }
  return event.code;
}

window.addEventListener(
  "keydown",
  (event) => {
    const code = eventCode(event);
    const active = document.activeElement;
    const playing = playingNow();
    const flightKey =
      code === "Space" ||
      code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight" ||
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD" ||
      code === "KeyE" ||
      code === "Enter" ||
      code === "KeyJ" ||
      code === "KeyK";
    const buttonArmed =
      !playing &&
      (code === "Enter" || code === "Space") &&
      active instanceof HTMLButtonElement &&
      !active.disabled;
    if (buttonArmed) {
      // Leave the default click to the button. game.key(Enter/Space) would start()
      // and the following click would start() again.
      return;
    }
    if (code === "Space" || code === "ArrowUp" || code === "ArrowDown") event.preventDefault();
    if (event.repeat && (code === "Enter" || code === "Escape" || code === "KeyE")) return;
    if (playing && active instanceof HTMLButtonElement) {
      active.blur();
      if (code === "Space" || code === "Enter") event.preventDefault();
    }
    if (playing && flightKey) {
      event.preventDefault();
      if (active instanceof HTMLElement && active !== surface) active.blur();
    }
    unlockAudio();
    game.key(code, true);
  },
  true,
);

window.addEventListener(
  "keyup",
  (event) => {
    game.key(eventCode(event), false);
  },
  true,
);

promptEl.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  unlockAudio();
  game.interact();
  grabPlayFocusSoon();
});

let thrustingPointer = false;

surface.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  unlockAudio();
  grabPlayFocusSoon();
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

const PAD_CODES = ["KeyA", "KeyD", "KeyW", "KeyS"] as const;

function bindHold(
  el: HTMLElement,
  onDown: () => void,
  onUp: () => void,
): void {
  let held = false;
  const down = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    unlockAudio();
    held = true;
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    el.blur();
    onDown();
  };
  const up = (event: Event) => {
    if (!held) return;
    if (event instanceof PointerEvent && event.type === "lostpointercapture" && event.buttons !== 0) {
      return;
    }
    held = false;
    onUp();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("lostpointercapture", up);
}

bindHold(
  fireBtn,
  () => game.setFire(true),
  () => game.setFire(false),
);

for (const pad of padsEl.querySelectorAll<HTMLButtonElement>("[data-key]")) {
  const code = pad.dataset.key;
  if (!code) continue;
  bindHold(
    pad,
    () => game.pad(code, true),
    () => game.pad(code, false),
  );
}

function releaseHolds(): void {
  thrustingPointer = false;
  game.clearPointer();
  game.setFire(false);
  game.clearPads();
  for (const code of PAD_CODES) game.key(code, false);
}

window.addEventListener("blur", releaseHolds);
padsEl.addEventListener("contextmenu", (event) => event.preventDefault());
fireBtn.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("resize", fit);
fit();

type BootWin = Window & { __reentryRaf?: number };
const boot = window as BootWin;
if (boot.__reentryRaf) cancelAnimationFrame(boot.__reentryRaf);

let last = performance.now();
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  try {
    game.update(dt);
    game.draw(gfx);
    syncLiveHud(game.hud());
  } catch (err) {
    console.error("RE-ENTRY frame", err);
  }
  boot.__reentryRaf = requestAnimationFrame(frame);
}
boot.__reentryRaf = requestAnimationFrame(frame);
