import {
  sfxBoom,
  sfxBossHit,
  sfxHit,
  sfxKey,
  sfxOver,
  sfxPickup,
  sfxReentry,
  sfxRescue,
  sfxShield,
  sfxShoot,
  sfxThrust,
  sfxWave,
  setMuted,
  toggleMuted,
} from "./audio.ts";
import { BOSS_BY_PLANET, PlanetBoss } from "./boss.ts";
import {
  PLANETS,
  SPACE_H,
  SPACE_W,
  SPAWN_CLEARANCE,
  type Cavern,
  type PlanetDef,
  circleHitsSolid,
  drawCavern,
  emptySpots,
  generateCavern,
  inExitShaft,
  moveAgainst,
  spaceWellAccel,
} from "./cavern.ts";
import { ReentryCine, RescueCine } from "./cinematic.ts";
import {
  ENERGY_DRAIN,
  ENERGY_HIT,
  FUEL_IDLE,
  FUEL_THRUST,
  RESCUE_FEE,
  gateObjective,
  loadMeta,
  lockPrompt,
  neededKey,
  planetUnlocked,
  playtestFlags,
  salvageLabel,
  saveMeta,
  titleKey,
  type MetaState,
} from "./meta.ts";

export type Mode = "menu" | "play" | "pause" | "over" | "cine";
export type Zone = "space" | "cavern";

export type HudSnapshot = {
  mode: Mode;
  score: number;
  high: number;
  lives: number;
  wave: number;
  combo: number;
  maxLives: number;
  credits: number;
  runCredits: number;
  banner: string;
  finalLine: string;
  loadout: string[];
  sector: string;
  fuel: number;
  maxFuel: number;
  energy: number;
  maxEnergy: number;
  cargo: number;
  salvageRate: number;
  objective: string;
  shielding: boolean;
  muted: boolean;
  zone: Zone;
  prompt: string;
};

type Ship = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  cooldown: number;
  invuln: number;
  thrusting: boolean;
  reversing: boolean;
  shielding: boolean;
};

type Gear = {
  rapid: boolean;
  twin: boolean;
  spread: boolean;
};

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  team: "ship" | "pet";
};

type Rock = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  size: number;
  rot: number;
  spin: number;
  verts: number[];
  stroke: string;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

type LootKind = "credits" | "ore" | "energy" | "rapid" | "twin" | "spread" | "pet" | "fuel";

type DiveHold = {
  rocks: Rock[];
  pickups: Pickup[];
};

type Pickup = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: LootKind;
  life: number;
  value: number;
};

type Pet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  cooldown: number;
  phase: number;
};

type Floater = { x: number; y: number; text: string; life: number; color: string };
type Star = {
  x: number;
  y: number;
  z: number;
  s: number;
  phase: number;
  speed: number;
  tint: string;
};
type Pointer = { x: number; y: number; down: boolean; at: number };

type SpaceHold = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rocks: Rock[];
  pickups: Pickup[];
  bullets: Bullet[];
  sparks: Spark[];
  floaters: Floater[];
};

const MAX_LIVES = 3;
const SHIP_R = 12;
const PET_R = 8;
const TURN = 4.8;
const THRUST = 360;
const MAX_SPEED_SPACE = 880;
const MAX_SPEED_CAVE = 390;
const BULLET_SPEED = 620;
const BULLET_LIFE = 1.05;
const MAX_PETS = 2;
const MAX_ROCKS = 40;
const MAX_SPARKS = 64;
const ZOOM_MIN = 0.015;
const ZOOM_MAX = 3.6;
/** Halo from the planet surface. `nearestPlanet` adds `radius`, so the prompt is local. */
const REENTRY_RANGE = 520;
const ROCK_STROKES = [
  "#7ee7ff",
  "#ffb36b",
  "#ff7ad9",
  "#7dffb1",
  "#c9a6ff",
  "#ff6b8a",
  "#ffe08a",
  "#9ad8ff",
  "#ff8a4d",
  "#b8ff6a",
];

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function hits(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const r = ar + br;
  return dist2(ax, ay, bx, by) < r * r;
}

function mulberry(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rockRadius(size: number): number {
  if (size >= 3) return 44;
  if (size === 2) return 26;
  return 14;
}

function rockPoints(size: number): number {
  if (size >= 3) return 20;
  if (size === 2) return 50;
  return 100;
}

function makeVerts(seed: number): number[] {
  const rand = mulberry(seed);
  const n = 7 + Math.floor(rand() * 4);
  const verts: number[] = [];
  for (let i = 0; i < n; i++) verts.push(0.64 + rand() * 0.46);
  return verts;
}

function bounce(
  x: number,
  y: number,
  vx: number,
  vy: number,
  r: number,
  worldW: number,
  worldH: number,
  rest = 0.72,
): { x: number; y: number; vx: number; vy: number } {
  const minX = r;
  const maxX = worldW - r;
  const minY = r;
  const maxY = worldH - r;
  if (x < minX) {
    x = minX;
    vx = Math.abs(vx) * rest;
  } else if (x > maxX) {
    x = maxX;
    vx = -Math.abs(vx) * rest;
  }
  if (y < minY) {
    y = minY;
    vy = Math.abs(vy) * rest;
  } else if (y > maxY) {
    y = maxY;
    vy = -Math.abs(vy) * rest;
  }
  return { x, y, vx, vy };
}

export class Game {
  w = 1280;
  h = 720;
  mode: Mode = "menu";
  score = 0;
  high = 0;
  lives = MAX_LIVES;
  wave = 1;
  combo = 1;
  credits = 0;
  runCredits = 0;
  banner = "";
  finalLine = "";
  onHud: ((hud: HudSnapshot) => void) | null = null;

  private zone: Zone = "space";
  private ship: Ship;
  private gear: Gear = { rapid: false, twin: false, spread: false };
  private bullets: Bullet[] = [];
  private rocks: Rock[] = [];
  private sparks: Spark[] = [];
  private pickups: Pickup[] = [];
  private pets: Pet[] = [];
  private floaters: Floater[] = [];
  private stars: Star[] = [];
  private keys = new Set<string>();
  private pads = new Set<string>();
  private pointer: Pointer | null = null;
  private fireHeld = false;
  private queuedFire = false;
  private shake = 0;
  private bannerLife = 0;
  private comboLife = 0;
  private thrustSfx = 0;
  private hudDirty = true;
  private seed = 1;
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private zoomWanted = 1;
  private fuel = 0;
  private energy = 0;
  private diveCargo = 0;
  private prompt = "";
  private planet: PlanetDef | null = null;
  private cavern: Cavern | null = null;
  private caverns = new Map<string, Cavern>();
  private diveHolds = new Map<string, DiveHold>();
  private bosses = new Map<string, PlanetBoss | "cleared">();
  private boss: PlanetBoss | null = null;
  private spaceHold: SpaceHold | null = null;
  private cine: ReentryCine | RescueCine | null = null;
  private cineKind: "reentry" | "rescue" | null = null;
  private pendingPlanet: PlanetDef | null = null;
  private meta: MetaState;
  private runBoost = false;
  private runUnlock = false;

  constructor() {
    this.meta = loadMeta();
    setMuted(this.meta.muted);
    this.credits = this.meta.credits;
    this.high = this.meta.high;
    this.fuel = this.meta.maxFuel;
    this.energy = this.meta.maxEnergy;
    this.ship = this.freshShip(SPACE_W * 0.5, SPACE_H * 0.5);
    this.snapCam();
    this.rebuildStars();
    this.decorateMenu();
  }

  resize(w: number, h: number): void {
    this.w = Math.max(320, w);
    this.h = Math.max(240, h);
    this.snapCam();
    if (this.mode === "menu") this.decorateMenu();
  }

  key(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);

    if (!down) return;
    if (code === "Enter") {
      if (this.mode === "cine") {
        this.skipCine();
        return;
      }
      if (this.mode === "menu" || this.mode === "over") this.start();
      else if (this.mode === "pause") this.resume();
      else if (this.mode === "play") this.tryTransit();
    }
    if (code === "KeyE") {
      if (this.mode === "cine") this.skipCine();
      else if (this.mode === "play") this.tryTransit();
    }
    if (code === "KeyR" && this.mode === "play") this.tryRescue();
    if (code === "KeyM") {
      this.meta.muted = toggleMuted();
      saveMeta(this.meta);
      this.announce(this.meta.muted ? "MUTED" : "SOUND ON");
    }
    if (code === "Space" && this.mode === "cine") this.skipCine();
    if (code === "Escape" || code === "KeyP") {
      if (this.mode === "cine") this.skipCine();
      else if (this.mode === "play") this.pause();
      else if (this.mode === "pause") this.resume();
    }
  }

  /** Touch-pad hold. Separate from `keys` so a pad release cannot drop a held keyboard key. */
  pad(code: string, down: boolean): void {
    if (down) this.pads.add(code);
    else this.pads.delete(code);
  }

  clearPads(): void {
    this.pads.clear();
  }

  private held(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code) || this.pads.has(code));
  }

  setPointer(sx: number, sy: number, down: boolean): void {
    this.pointer = {
      x: sx / this.zoom + this.camX,
      y: sy / this.zoom + this.camY,
      down,
      at: performance.now(),
    };
  }

  clearPointer(): void {
    if (this.pointer) this.pointer.down = false;
  }

  setFire(held: boolean): void {
    this.fireHeld = held;
  }

  pulseFire(): void {
    this.queuedFire = true;
    if (this.mode !== "play" || this.zone !== "space" || !this.pointer) return;
    for (const planet of PLANETS) {
      const reach = planet.radius + 56;
      if (dist2(this.pointer.x, this.pointer.y, planet.x, planet.y) < reach * reach) {
        if (this.nearestPlanet(REENTRY_RANGE) === planet) this.beginReentry(planet);
        return;
      }
    }
  }

  wheel(deltaY: number): void {
    const factor = Math.exp(-deltaY * 0.0018);
    this.zoomWanted = clamp(this.zoomWanted * factor, ZOOM_MIN, ZOOM_MAX);
  }

  start(): void {
    this.mode = "play";
    this.zone = "space";
    this.planet = null;
    this.cavern = null;
    this.spaceHold = null;
    this.cine = null;
    this.cineKind = null;
    this.pendingPlanet = null;
    this.score = 0;
    this.lives = MAX_LIVES;
    this.wave = 1;
    this.combo = 1;
    this.comboLife = 0;
    this.runCredits = 0;
    this.diveCargo = 0;
    this.prompt = "";
    this.gear = { rapid: false, twin: false, spread: false };
    this.bullets = [];
    this.sparks = [];
    this.pickups = [];
    this.pets = [];
    this.floaters = [];
    this.caverns = new Map();
    this.diveHolds = new Map();
    this.bosses = new Map();
    this.boss = null;
    const flags = playtestFlags();
    this.runBoost = flags.boost;
    this.runUnlock = flags.unlock;
    if (this.runBoost) {
      this.meta.credits = Math.max(this.meta.credits, 40);
      saveMeta(this.meta);
    }
    this.credits = this.meta.credits;
    this.fuel = this.runBoost ? Math.max(this.meta.maxFuel, 120) : this.meta.maxFuel;
    this.energy = this.runBoost ? Math.max(this.meta.maxEnergy, 80) : this.meta.maxEnergy;
    const home = PLANETS[0];
    this.ship = this.freshShip(home.x + home.radius + SPAWN_CLEARANCE, home.y);
    this.ship.angle = Math.PI;
    this.rocks = [];
    this.seed = (Math.random() * 1e9) | 0;
    this.snapCam();
    this.spawnWave(this.wave);
    this.announce("CINDER AHEAD");
    sfxWave();
    this.markHud();
  }

  pause(): void {
    if (this.mode !== "play") return;
    this.mode = "pause";
    this.markHud();
  }

  resume(): void {
    if (this.mode !== "pause") return;
    this.mode = "play";
    this.markHud();
  }

  hud(): HudSnapshot {
    return {
      mode: this.mode,
      score: this.score,
      high: this.high,
      lives: this.lives,
      wave: this.wave,
      combo: this.combo,
      maxLives: MAX_LIVES,
      credits: this.credits,
      runCredits: this.runCredits,
      banner: this.banner,
      finalLine: this.finalLine,
      loadout: this.loadoutLabels(),
      sector: this.planet ? this.planet.name.toUpperCase() : `SPACE · W${this.wave}`,
      fuel: this.fuel,
      maxFuel: this.tankMax(),
      energy: this.energy,
      maxEnergy: this.energyMax(),
      cargo: this.diveCargo,
      salvageRate: this.meta.salvageRate,
      objective: this.objectiveText(),
      shielding: this.ship.shielding,
      muted: this.meta.muted,
      zone: this.zone,
      prompt: this.prompt,
    };
  }

  update(dt: number): void {
    const t = clamp(dt, 0, 0.05);
    this.shake = Math.max(0, this.shake - t * 22);
    if (this.bannerLife > 0) {
      this.bannerLife -= t;
      if (this.bannerLife <= 0) this.banner = "";
    }

    if (this.cine) {
      this.cine.update(t);
      if (this.cine.done) this.finishCine();
      return;
    }

    if (this.mode === "pause" || this.mode === "over") {
      this.driftDecor(t * 0.35);
      this.stepSparks(t);
      this.followCam(t);
      return;
    }

    if (this.mode === "menu") {
      this.driftDecor(t);
      this.stepSparks(t);
      this.followCam(t);
      return;
    }

    this.stepShip(t);
    this.stepPets(t);
    this.stepBullets(t);
    this.stepRocks(t);
    this.stepPickups(t);
    this.stepSparks(t);
    this.stepFloaters(t);
    this.followCam(t);
    this.comboLife = Math.max(0, this.comboLife - t);
    if (this.comboLife === 0 && this.combo !== 1) {
      this.combo = 1;
      this.markHud();
    }
    this.stepBoss(t);
    this.collide();
    this.updatePrompt();
    if (this.zone === "space") this.checkWave();

    if (this.hudDirty) {
      this.hudDirty = false;
      this.onHud?.(this.hud());
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.cine) {
      this.cine.draw(ctx, this.w, this.h);
      return;
    }
    this.drawBackdrop(ctx);

    ctx.save();
    if (this.shake > 0.4) {
      const mag = this.shake * 0.7;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    if (this.cavern) {
      drawCavern(ctx, this.cavern, this.camX, this.camY, this.viewW(), this.viewH());
    } else {
      this.drawPlanets(ctx);
    }

    for (const spark of this.sparks) {
      if (this.inView(spark.x, spark.y, 16)) this.drawSpark(ctx, spark);
    }
    for (const rock of this.rocks) {
      if (this.inView(rock.x, rock.y, rock.radius + 6)) this.drawRock(ctx, rock);
    }
    for (const pickup of this.pickups) {
      if (this.inView(pickup.x, pickup.y, 22)) this.drawPickup(ctx, pickup);
    }
    for (const bullet of this.bullets) {
      if (this.inView(bullet.x, bullet.y, 10)) this.drawBullet(ctx, bullet);
    }
    for (const pet of this.pets) this.drawPet(ctx, pet);
    if (this.boss?.alive) this.boss.draw(ctx, this.zoom);
    if (this.mode !== "menu") this.drawShip(ctx);
    for (const floater of this.floaters) {
      if (this.inView(floater.x, floater.y, 40)) this.drawFloater(ctx, floater);
    }
    this.drawWorldNav(ctx);

    ctx.restore();
    this.drawBanner(ctx);
    this.drawNavMarker(ctx);
    if (this.mode !== "menu") this.drawMinimap(ctx);
  }

  private worldW(): number {
    return this.cavern ? this.cavern.width : SPACE_W;
  }

  private worldH(): number {
    return this.cavern ? this.cavern.height : SPACE_H;
  }

  private markHud(): void {
    this.hudDirty = true;
    this.onHud?.(this.hud());
  }

  private loadoutLabels(): string[] {
    const tags: string[] = [];
    if (this.gear.twin) tags.push("Twin");
    if (this.gear.spread) tags.push("Spread");
    if (this.gear.rapid) tags.push("Rapid");
    if (this.ship.shielding) tags.push("Shield");
    if (this.pets.length === 1) tags.push("Pet");
    if (this.pets.length > 1) tags.push(`${this.pets.length} Pets`);
    tags.push(`Tank ${Math.round(this.tankMax())}`);
    tags.push(salvageLabel(this.meta.salvageRate));
    for (const key of this.ownedKeys()) {
      if (key === "helix") tags.push("Helix Clear");
      else tags.push(titleKey(key));
    }
    return tags;
  }

  private tankMax(): number {
    return this.runBoost ? Math.max(this.meta.maxFuel, 120) : this.meta.maxFuel;
  }

  private energyMax(): number {
    return this.runBoost ? Math.max(this.meta.maxEnergy, 80) : this.meta.maxEnergy;
  }

  private ownedKeys(): string[] {
    if (this.runUnlock) return ["cinder", "rime", "mycel", "vesper"];
    return this.meta.keys;
  }

  private freshShip(x: number, y: number): Ship {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      cooldown: 0,
      invuln: 2,
      thrusting: false,
      reversing: false,
      shielding: false,
    };
  }

  private viewW(): number {
    return this.w / this.zoom;
  }

  private viewH(): number {
    return this.h / this.zoom;
  }

  private snapCam(): void {
    const vw = this.viewW();
    const vh = this.viewH();
    const ww = this.worldW();
    const wh = this.worldH();
    this.camX = vw >= ww ? (ww - vw) / 2 : clamp(this.ship.x - vw / 2, 0, ww - vw);
    this.camY = vh >= wh ? (wh - vh) / 2 : clamp(this.ship.y - vh / 2, 0, wh - vh);
  }

  private followCam(dt: number): void {
    this.zoom += (this.zoomWanted - this.zoom) * (1 - Math.exp(-14 * dt));
    const vw = this.viewW();
    const vh = this.viewH();
    const ww = this.worldW();
    const wh = this.worldH();
    const tx = vw >= ww ? (ww - vw) / 2 : clamp(this.ship.x - vw / 2, 0, ww - vw);
    const ty = vh >= wh ? (wh - vh) / 2 : clamp(this.ship.y - vh / 2, 0, wh - vh);
    const k = 1 - Math.exp(-8 * dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  private inView(x: number, y: number, pad: number): boolean {
    return (
      x > this.camX - pad &&
      x < this.camX + this.viewW() + pad &&
      y > this.camY - pad &&
      y < this.camY + this.viewH() + pad
    );
  }

  private rebuildStars(): void {
    const stars: Star[] = [];
    const rand = mulberry(9041);
    const tints = ["#f4f7ff", "#c8e8ff", "#ffe9c4", "#d4fff0", "#ffd0ea"];
    for (let i = 0; i < 160; i++) {
      stars.push({
        x: rand(),
        y: rand(),
        z: 0.18 + rand() * 0.82,
        s: 0.7 + rand() * 2.2,
        phase: rand() * Math.PI * 2,
        speed: 1.2 + rand() * 5.5,
        tint: tints[Math.floor(rand() * tints.length)] ?? "#f4f7ff",
      });
    }
    this.stars = stars;
  }

  private decorateMenu(): void {
    this.zone = "space";
    this.planet = null;
    this.cavern = null;
    this.rocks = [];
    this.sparks = [];
    this.pickups = [];
    this.pets = [];
    this.ship = this.freshShip(SPACE_W * 0.5, SPACE_H * 0.5);
    this.snapCam();
    for (let i = 0; i < 6; i++) {
      this.spawnRock(1 + (i % 3), {
        x: SPACE_W * 0.5 + (i - 2.5) * 90,
        y: SPACE_H * 0.5 + ((i % 3) - 1) * 70,
        away: false,
      });
    }
  }

  private announce(text: string): void {
    this.banner = text;
    this.bannerLife = 2.1;
    this.markHud();
  }

  private closestPlanet(): PlanetDef {
    let best: PlanetDef = PLANETS[0] as PlanetDef;
    let bestD = Infinity;
    for (const planet of PLANETS) {
      const d = dist2(this.ship.x, this.ship.y, planet.x, planet.y);
      if (d < bestD) {
        bestD = d;
        best = planet;
      }
    }
    return best;
  }

  private nearestPlanet(range: number): PlanetDef | null {
    let best: PlanetDef | null = null;
    let bestD = Infinity;
    for (const planet of PLANETS) {
      const d = dist2(this.ship.x, this.ship.y, planet.x, planet.y);
      const limit = (planet.radius + range) * (planet.radius + range);
      if (d < limit && d < bestD) {
        bestD = d;
        best = planet;
      }
    }
    return best;
  }

  private updatePrompt(): void {
    let next = "";
    if (this.zone === "space") {
      const planet = this.nearestPlanet(REENTRY_RANGE);
      if (planet) {
        if (this.isUnlocked(planet.id)) next = `Re-enter ${planet.name}  —  E`;
        else {
          const need = neededKey(planet.id);
          next = need ? lockPrompt(planet.name, need) : `Re-enter ${planet.name}  —  E`;
        }
      }
    } else if (this.cavern && this.fuel <= 0) {
      next = `Stranded — R rescue beam (${RESCUE_FEE} CR)`;
    } else if (this.cavern && inExitShaft(this.cavern, this.ship.x, this.ship.y)) {
      next = this.diveCargo > 0 ? "Launch to space — E  (bank cargo)" : "Launch to space  —  E";
    }
    if (next !== this.prompt) {
      this.prompt = next;
      this.markHud();
    }
  }

  private objectiveText(): string {
    if (this.zone === "space") {
      const near = this.nearestPlanet(REENTRY_RANGE);
      if (near && !this.isUnlocked(near.id)) {
        const need = neededKey(near.id);
        if (need) return lockPrompt(near.name, need);
      }
      return gateObjective(this.ownedKeys());
    }
    if (this.boss?.alive) return `Defeat ${this.boss.def.name}`;
    if (this.planet && this.diveCargo > 0) return "Launch — bank cargo";
    return gateObjective(this.ownedKeys());
  }

  private isUnlocked(id: string): boolean {
    return planetUnlocked(id, this.ownedKeys());
  }

  private tryTransit(): void {
    if (this.zone === "space") {
      const planet = this.nearestPlanet(REENTRY_RANGE);
      if (planet) this.beginReentry(planet);
      return;
    }
    if (this.cavern && inExitShaft(this.cavern, this.ship.x, this.ship.y)) {
      this.exitPlanet(1);
    }
  }

  private tryRescue(): void {
    if (this.zone !== "cavern" || this.fuel > 0) return;
    this.beginRescue();
  }

  private beginReentry(planet: PlanetDef): void {
    if (!this.isUnlocked(planet.id)) {
      const need = neededKey(planet.id);
      this.announce(need ? lockPrompt(planet.name, need) : `${planet.name.toUpperCase()} LOCKED`);
      return;
    }
    this.pendingPlanet = planet;
    this.cineKind = "reentry";
    this.cine = new ReentryCine(planet);
    this.mode = "cine";
    sfxReentry();
    this.markHud();
  }

  private beginRescue(): void {
    if (this.cineKind === "rescue") return;
    this.cineKind = "rescue";
    this.cine = new RescueCine(this.meta.salvageRate);
    this.mode = "cine";
    sfxRescue();
    this.markHud();
  }

  private skipCine(): void {
    if (!this.cine) return;
    this.cine.skip();
    this.finishCine();
  }

  private finishCine(): void {
    const planet = this.pendingPlanet;
    const kind = this.cineKind;
    this.cine = null;
    this.cineKind = null;
    this.pendingPlanet = null;
    this.mode = "play";
    if (kind === "rescue") this.completeRescue();
    else if (planet) this.enterPlanet(planet);
    else this.markHud();
  }

  private enterPlanet(planet: PlanetDef): void {
    this.spaceHold = {
      x: this.ship.x,
      y: this.ship.y,
      vx: this.ship.vx,
      vy: this.ship.vy,
      rocks: this.rocks,
      pickups: this.pickups,
      bullets: this.bullets,
      sparks: this.sparks,
      floaters: this.floaters,
    };
    let cavern = this.caverns.get(planet.id);
    if (!cavern) {
      cavern = generateCavern(planet);
      this.caverns.set(planet.id, cavern);
    }
    this.zone = "cavern";
    this.planet = planet;
    this.cavern = cavern;
    this.rocks = [];
    this.pickups = [];
    this.bullets = [];
    this.sparks = [];
    this.floaters = [];
    this.diveCargo = 0;
    this.fuel = this.tankMax();
    this.ship = this.freshShip(cavern.spawnX, cavern.spawnY);
    this.ship.invuln = 1.4;
    for (const pet of this.pets) {
      pet.x = this.ship.x - 24;
      pet.y = this.ship.y + 10;
      pet.vx = 0;
      pet.vy = 0;
    }
    const hold = this.diveHolds.get(planet.id);
    if (hold) {
      this.rocks = hold.rocks;
      this.pickups = hold.pickups;
    } else {
      this.populateCavern(planet, cavern);
      this.diveHolds.set(planet.id, { rocks: this.rocks, pickups: this.pickups });
    }
    this.bindBoss(planet, cavern);
    this.snapCam();
    this.announce(planet.name.toUpperCase());
    sfxWave();
    this.markHud();
  }

  private exitPlanet(bankRate: number | null, banner = "OPEN SPACE"): void {
    const planet = this.planet;
    const hold = this.spaceHold;
    if (planet) {
      this.diveHolds.set(planet.id, { rocks: this.rocks, pickups: this.pickups });
    }
    if (bankRate != null) this.bankCargo(bankRate);
    this.zone = "space";
    this.planet = null;
    this.cavern = null;
    this.boss = null;
    if (hold) {
      this.rocks = hold.rocks;
      this.pickups = hold.pickups;
      this.bullets = [];
      this.sparks = [];
      this.floaters = [];
    }
    this.spaceHold = null;
    let x = SPACE_W * 0.5;
    let y = SPACE_H * 0.5;
    if (planet) {
      const ang = Math.atan2(
        (hold?.y ?? planet.y) - planet.y,
        (hold?.x ?? planet.x) - planet.x,
      );
      x = planet.x + Math.cos(ang) * (planet.radius + 120);
      y = planet.y + Math.sin(ang) * (planet.radius + 120);
    } else if (hold) {
      x = hold.x;
      y = hold.y;
    }
    this.ship = this.freshShip(x, y);
    this.ship.invuln = 1.2;
    for (const pet of this.pets) {
      pet.x = this.ship.x - 20;
      pet.y = this.ship.y;
    }
    this.snapCam();
    this.announce(banner);
    sfxWave();
    this.markHud();
  }

  private populateCavern(planet: PlanetDef, cavern: Cavern): void {
    const pods = emptySpots(cavern, planet.pods, planet.seed + 17, 20);
    for (const spot of pods) {
      if (this.nearBoss(spot.x, spot.y, cavern, 90)) continue;
      this.spawnRock(1 + (this.seed % 2), {
        x: spot.x,
        y: spot.y,
        away: false,
      });
    }
    const loot = emptySpots(cavern, planet.loot, planet.seed + 91, 22);
    const kinds: LootKind[] = ["ore", "ore", "ore", "energy", "rapid", "twin", "spread", "pet"];
    loot.forEach((spot, i) => {
      if (this.nearBoss(spot.x, spot.y, cavern, 90)) return;
      const kind = kinds[i % kinds.length] ?? "ore";
      this.pickups.push({
        x: spot.x,
        y: spot.y,
        vx: 0,
        vy: 0,
        kind,
        life: 240,
        value: kind === "ore" ? 12 + (i % 9) : kind === "energy" ? 18 : 0,
      });
    });
    const fuel = emptySpots(cavern, planet.fuel, planet.seed + 44, 16);
    for (const spot of fuel) {
      if (this.nearBoss(spot.x, spot.y, cavern, 80)) continue;
      this.pickups.push({
        x: spot.x,
        y: spot.y,
        vx: 0,
        vy: 0,
        kind: "fuel",
        life: 240,
        value: 16,
      });
    }
  }

  private nearBoss(x: number, y: number, cavern: Cavern, range: number): boolean {
    return dist2(x, y, cavern.bossX, cavern.bossY) < range * range;
  }

  private bindBoss(planet: PlanetDef, cavern: Cavern): void {
    const def = BOSS_BY_PLANET[planet.id];
    const prior = this.bosses.get(planet.id);
    if (!def || prior === "cleared" || (def.keyId && this.ownedKeys().includes(def.keyId))) {
      this.boss = null;
      return;
    }
    if (prior) {
      this.boss = prior;
      return;
    }
    this.boss = new PlanetBoss(def, cavern.bossX, cavern.bossY);
    this.bosses.set(planet.id, this.boss);
  }

  private bankCargo(rate: number): void {
    const banked = Math.floor(this.diveCargo * rate);
    if (banked > 0) {
      this.meta.credits += banked;
      this.runCredits += banked;
      this.credits = this.meta.credits;
      saveMeta(this.meta);
    }
    this.diveCargo = 0;
  }

  private completeRescue(): void {
    const banked = Math.floor(this.diveCargo * this.meta.salvageRate);
    this.bankCargo(this.meta.salvageRate);
    const fee = Math.min(RESCUE_FEE, this.meta.credits);
    this.meta.credits -= fee;
    this.credits = this.meta.credits;
    saveMeta(this.meta);
    this.exitPlanet(null, `RESCUE +${banked} CR  (−${fee} fee)`);
  }

  private spawnWave(wave: number): void {
    const n = 5 + wave * 2;
    for (let i = 0; i < n; i++) this.spawnRock(3, { away: true });
    this.capRocks();
  }

  private capRocks(): void {
    while (this.rocks.length > MAX_ROCKS) {
      let far = 0;
      let farD = -1;
      this.rocks.forEach((rock, i) => {
        const d = dist2(rock.x, rock.y, this.ship.x, this.ship.y);
        if (d > farD) {
          farD = d;
          far = i;
        }
      });
      this.rocks.splice(far, 1);
    }
  }

  private spawnRock(
    size: number,
    opts: { x?: number; y?: number; vx?: number; vy?: number; away?: boolean },
  ): void {
    const rand = mulberry(++this.seed);
    const radius = rockRadius(size);
    const ww = this.worldW();
    const wh = this.worldH();
    let x = opts.x ?? radius + rand() * (ww - radius * 2);
    let y = opts.y ?? radius + rand() * (wh - radius * 2);
    if (opts.away) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const ang = rand() * Math.PI * 2;
        const dist = 900 + rand() * 2200;
        x = this.ship.x + Math.cos(ang) * dist;
        y = this.ship.y + Math.sin(ang) * dist;
        x = clamp(x, radius + 40, ww - radius - 40);
        y = clamp(y, radius + 40, wh - radius - 40);
        if (dist2(x, y, this.ship.x, this.ship.y) > 700 * 700) break;
      }
    }
    if (this.cavern && circleHitsSolid(this.cavern, x, y, radius)) return;
    const speed = (22 + rand() * 34 + (4 - size) * 16) * (0.85 + this.wave * 0.04);
    const heading = rand() * Math.PI * 2;
    this.rocks.push({
      x,
      y,
      vx: opts.vx ?? Math.cos(heading) * speed,
      vy: opts.vy ?? Math.sin(heading) * speed,
      radius,
      size,
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 1.2,
      verts: makeVerts(this.seed),
      stroke: ROCK_STROKES[Math.floor(rand() * ROCK_STROKES.length)] ?? "#7ee7ff",
    });
  }

  private burst(
    x: number,
    y: number,
    n: number,
    color: string,
    speed: number,
  ): void {
    const count = Math.min(n, MAX_SPARKS - this.sparks.length);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random());
      const life = 0.22 + Math.random() * 0.32;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        size: 1 + Math.random() * 2,
        color,
      });
    }
  }

  private stepShip(dt: number): void {
    const ship = this.ship;
    ship.cooldown = Math.max(0, ship.cooldown - dt);
    ship.invuln = Math.max(0, ship.invuln - dt);

    const left = this.held("ArrowLeft", "KeyA");
    const right = this.held("ArrowRight", "KeyD");
    const keyThrust = this.held("ArrowUp", "KeyW");
    const keyReverse = this.held("ArrowDown", "KeyS");
    const wantShield = this.held("ShiftLeft", "ShiftRight");

    if (left) ship.angle -= TURN * dt;
    if (right) ship.angle += TURN * dt;
    const canThrust = this.zone === "space" || this.fuel > 0;
    ship.thrusting = canThrust && keyThrust;
    ship.reversing = canThrust && keyReverse && !keyThrust;

    if (wantShield && this.energy > 0) {
      if (!ship.shielding) sfxShield();
      ship.shielding = true;
      this.energy = Math.max(0, this.energy - ENERGY_DRAIN * dt);
      if (this.energy <= 0) ship.shielding = false;
    } else {
      ship.shielding = false;
    }

    if (ship.thrusting || ship.reversing) {
      const dir = ship.reversing ? -1 : 1;
      const power = ship.reversing ? THRUST * 0.7 : THRUST;
      ship.vx += Math.cos(ship.angle) * power * dir * dt;
      ship.vy += Math.sin(ship.angle) * power * dir * dt;
      if (this.zone === "cavern") {
        this.fuel = Math.max(0, this.fuel - FUEL_THRUST * dt);
      }
      this.thrustSfx -= dt;
      if (this.thrustSfx <= 0) {
        this.burst(
          ship.x - Math.cos(ship.angle) * dir * 12,
          ship.y - Math.sin(ship.angle) * dir * 12,
          1,
          "#7ee7ff",
          70,
        );
        sfxThrust();
        this.thrustSfx = 0.07;
      }
    } else if (this.zone === "cavern") {
      this.fuel = Math.max(0, this.fuel - FUEL_IDLE * dt);
    }

    if (this.zone === "cavern" && this.planet) {
      ship.vy += this.planet.gravity * dt;
    } else if (this.zone === "space") {
      const well = spaceWellAccel(ship.x, ship.y);
      ship.vx += well.ax * dt;
      ship.vy += well.ay * dt;
    }

    const maxSpeed = this.zone === "cavern" ? MAX_SPEED_CAVE : MAX_SPEED_SPACE;
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > maxSpeed) {
      ship.vx = (ship.vx / speed) * maxSpeed;
      ship.vy = (ship.vy / speed) * maxSpeed;
    }
    const drag = this.zone === "cavern" ? 0.12 : 0.32;
    ship.vx *= Math.max(0, 1 - drag * dt);
    ship.vy *= Math.max(0, 1 - drag * dt);

    if (this.cavern) {
      const moved = moveAgainst(
        this.cavern,
        ship.x,
        ship.y,
        ship.vx * dt,
        ship.vy * dt,
        SHIP_R,
        0.28,
      );
      ship.x = moved.x;
      ship.y = moved.y;
      if (moved.hit) {
        const impact = Math.hypot(ship.vx, ship.vy);
        ship.vx = moved.vx / dt;
        ship.vy = moved.vy / dt;
        if (impact > 340 && ship.invuln <= 0) this.crashHit();
      }
    } else {
      const next = bounce(
        ship.x + ship.vx * dt,
        ship.y + ship.vy * dt,
        ship.vx,
        ship.vy,
        SHIP_R,
        this.worldW(),
        this.worldH(),
        0.55,
      );
      ship.x = next.x;
      ship.y = next.y;
      ship.vx = next.vx;
      ship.vy = next.vy;
    }

    const wantFire =
      this.queuedFire ||
      this.fireHeld ||
      this.held("Space", "KeyJ", "KeyK");
    this.queuedFire = false;
    if (wantFire && ship.cooldown <= 0) this.fire();
  }

  private crashHit(): void {
    this.absorbOrDie();
  }

  private absorbOrDie(): void {
    const ship = this.ship;
    if (ship.shielding && this.energy > 0) {
      this.energy = Math.max(0, this.energy - ENERGY_HIT);
      ship.invuln = 0.75;
      this.shake = 7;
      if (this.energy <= 0) ship.shielding = false;
      this.markHud();
      sfxBoom(1);
      return;
    }
    this.killShip();
  }

  private fire(): void {
    const ship = this.ship;
    ship.cooldown = this.gear.rapid ? 0.07 : 0.17;
    const shots = this.shipShots();
    for (const shot of shots) {
      const a = ship.angle + shot.angle;
      const px =
        ship.x +
        Math.cos(ship.angle) * 14 +
        Math.cos(ship.angle + Math.PI / 2) * shot.lateral;
      const py =
        ship.y +
        Math.sin(ship.angle) * 14 +
        Math.sin(ship.angle + Math.PI / 2) * shot.lateral;
      this.bullets.push({
        x: px,
        y: py,
        vx: Math.cos(a) * BULLET_SPEED + ship.vx * 0.2,
        vy: Math.sin(a) * BULLET_SPEED + ship.vy * 0.2,
        life: BULLET_LIFE,
        team: "ship",
      });
    }
    sfxShoot();
  }

  private shipShots(): { angle: number; lateral: number }[] {
    if (this.gear.spread && this.gear.twin) {
      return [
        { angle: -0.28, lateral: 0 },
        { angle: -0.12, lateral: 0 },
        { angle: 0, lateral: 0 },
        { angle: 0.12, lateral: 0 },
        { angle: 0.28, lateral: 0 },
      ];
    }
    if (this.gear.spread) {
      return [
        { angle: -0.2, lateral: 0 },
        { angle: 0, lateral: 0 },
        { angle: 0.2, lateral: 0 },
      ];
    }
    if (this.gear.twin) {
      return [
        { angle: 0, lateral: -7 },
        { angle: 0, lateral: 7 },
      ];
    }
    return [{ angle: 0, lateral: 0 }];
  }

  private stepPets(dt: number): void {
    const ship = this.ship;
    this.pets.forEach((pet, i) => {
      const orbit = ((i + 1) / (this.pets.length + 1)) * Math.PI * 2 + pet.phase;
      pet.phase += dt * 1.4;
      const tx = ship.x + Math.cos(orbit) * 42 - Math.cos(ship.angle) * 28;
      const ty = ship.y + Math.sin(orbit) * 42 - Math.sin(ship.angle) * 28;
      pet.vx += (tx - pet.x) * 7 * dt;
      pet.vy += (ty - pet.y) * 7 * dt;
      pet.vx *= Math.max(0, 1 - 4.2 * dt);
      pet.vy *= Math.max(0, 1 - 4.2 * dt);
      if (this.cavern) {
        const moved = moveAgainst(this.cavern, pet.x, pet.y, pet.vx * dt, pet.vy * dt, PET_R, 0.2);
        pet.x = moved.x;
        pet.y = moved.y;
        pet.vx = moved.hit ? moved.vx / dt : pet.vx;
        pet.vy = moved.hit ? moved.vy / dt : pet.vy;
      } else {
        const moved = bounce(
          pet.x + pet.vx * dt,
          pet.y + pet.vy * dt,
          pet.vx,
          pet.vy,
          PET_R,
          this.worldW(),
          this.worldH(),
          0.4,
        );
        pet.x = moved.x;
        pet.y = moved.y;
        pet.vx = moved.vx;
        pet.vy = moved.vy;
      }
      pet.cooldown = Math.max(0, pet.cooldown - dt);
      const target = this.nearestFoe(pet.x, pet.y, 520);
      if (target) {
        pet.angle = Math.atan2(target.y - pet.y, target.x - pet.x);
        if (pet.cooldown <= 0) {
          pet.cooldown = 0.28;
          this.bullets.push({
            x: pet.x + Math.cos(pet.angle) * 10,
            y: pet.y + Math.sin(pet.angle) * 10,
            vx: Math.cos(pet.angle) * 520,
            vy: Math.sin(pet.angle) * 520,
            life: 0.85,
            team: "pet",
          });
        }
      } else {
        pet.angle = ship.angle;
      }
    });
  }

  private nearestFoe(x: number, y: number, range: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = this.nearestRock(x, y, range);
    let bestD = best ? dist2(x, y, best.x, best.y) : range * range;
    if (this.boss?.alive) {
      const d = dist2(x, y, this.boss.x, this.boss.y);
      if (d < bestD) {
        best = this.boss;
        bestD = d;
      }
    }
    return best;
  }

  private nearestRock(x: number, y: number, range: number): Rock | null {
    let best: Rock | null = null;
    let bestD = range * range;
    for (const rock of this.rocks) {
      const d = dist2(x, y, rock.x, rock.y);
      if (d < bestD) {
        bestD = d;
        best = rock;
      }
    }
    return best;
  }

  private stepBullets(dt: number): void {
    const next: Bullet[] = [];
    const ww = this.worldW();
    const wh = this.worldH();
    for (const b of this.bullets) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0 || b.x > ww || b.y < 0 || b.y > wh) continue;
      if (this.cavern && circleHitsSolid(this.cavern, b.x, b.y, 2)) continue;
      if (b.life > 0) next.push(b);
    }
    this.bullets = next;
  }

  private stepRocks(dt: number): void {
    for (const rock of this.rocks) {
      if (this.cavern) {
        rock.vy += (this.planet?.gravity ?? 0) * 0.18 * dt;
        const moved = moveAgainst(
          this.cavern,
          rock.x,
          rock.y,
          rock.vx * dt,
          rock.vy * dt,
          rock.radius * 0.8,
          0.55,
        );
        rock.x = moved.x;
        rock.y = moved.y;
        rock.vx = moved.hit ? moved.vx / dt : rock.vx;
        rock.vy = moved.hit ? moved.vy / dt : rock.vy;
      } else {
        const moved = bounce(
          rock.x + rock.vx * dt,
          rock.y + rock.vy * dt,
          rock.vx,
          rock.vy,
          rock.radius,
          this.worldW(),
          this.worldH(),
          1,
        );
        rock.x = moved.x;
        rock.y = moved.y;
        rock.vx = moved.vx;
        rock.vy = moved.vy;
      }
      rock.rot += rock.spin * dt;
    }
  }

  private driftDecor(dt: number): void {
    for (const rock of this.rocks) {
      rock.x += rock.vx * dt * 0.25;
      rock.y += rock.vy * dt * 0.25;
      rock.rot += rock.spin * dt * 0.4;
    }
  }

  private stepPickups(dt: number): void {
    const ship = this.ship;
    const next: Pickup[] = [];
    for (const p of this.pickups) {
      if (this.zone === "space") p.life -= dt;
      const d2 = dist2(p.x, p.y, ship.x, ship.y);
      if (d2 < 160 * 160) {
        const d = Math.sqrt(d2) || 1;
        const pull = p.kind === "credits" || p.kind === "ore" || p.kind === "fuel" || p.kind === "energy" ? 420 : 280;
        p.vx += ((ship.x - p.x) / d) * pull * dt;
        p.vy += ((ship.y - p.y) / d) * pull * dt;
      }
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (this.cavern) {
        const moved = moveAgainst(this.cavern, p.x, p.y, p.vx * dt, p.vy * dt, 8, 0.2);
        p.x = moved.x;
        p.y = moved.y;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.life > 0) next.push(p);
    }
    this.pickups = next;
  }

  private stepSparks(dt: number): void {
    const next: Spark[] = [];
    for (const s of this.sparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.97;
      s.vy *= 0.97;
      if (s.life > 0) next.push(s);
    }
    this.sparks = next.length > MAX_SPARKS ? next.slice(-MAX_SPARKS) : next;
  }

  private stepFloaters(dt: number): void {
    const next: Floater[] = [];
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life > 0) next.push(f);
    }
    this.floaters = next;
  }

  private collide(): void {
    const ship = this.ship;

    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];
      if (!rock) continue;
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if (!b) continue;
        if (hits(rock.x, rock.y, rock.radius, b.x, b.y, 3)) {
          this.bullets.splice(j, 1);
          this.breakRock(i, b.x, b.y);
          break;
        }
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p) continue;
      if (hits(ship.x, ship.y, SHIP_R + 8, p.x, p.y, 12)) {
        this.collect(p);
        this.pickups.splice(i, 1);
      }
    }

    this.collideBoss(ship);

    if (ship.invuln > 0) return;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];
      if (!rock) continue;
      if (hits(ship.x, ship.y, SHIP_R - 2, rock.x, rock.y, rock.radius * 0.86)) {
        if (ship.shielding && this.energy > 0) {
          this.absorbOrDie();
          this.breakRock(i, ship.x, ship.y);
        } else {
          this.killShip();
        }
        break;
      }
    }
  }

  private collideBoss(ship: Ship): void {
    const boss = this.boss;
    if (!boss?.alive) return;
    for (let j = this.bullets.length - 1; j >= 0; j--) {
      const b = this.bullets[j];
      if (!b) continue;
      if (hits(boss.x, boss.y, boss.def.radius, b.x, b.y, 3)) {
        this.bullets.splice(j, 1);
        sfxBossHit();
        if (boss.hurt(b.team === "pet" ? 2 : 4)) this.onBossDown();
      }
    }
    if (ship.invuln > 0) return;
    for (let i = boss.shots.length - 1; i >= 0; i--) {
      const shot = boss.shots[i];
      if (!shot) continue;
      if (hits(ship.x, ship.y, SHIP_R - 1, shot.x, shot.y, shot.radius)) {
        boss.shots.splice(i, 1);
        this.absorbOrDie();
        return;
      }
    }
    if (boss.ringHits(ship.x, ship.y, SHIP_R)) {
      this.absorbOrDie();
      return;
    }
    if (hits(ship.x, ship.y, SHIP_R - 2, boss.x, boss.y, boss.def.radius * 0.8)) {
      this.absorbOrDie();
    }
  }

  private stepBoss(dt: number): void {
    if (!this.boss?.alive) return;
    this.boss.update(dt, this.ship.x, this.ship.y, this.cavern, (x, y, size) => {
      this.spawnRock(size, { x, y, away: false });
    });
  }

  private onBossDown(): void {
    const boss = this.boss;
    if (!boss) return;
    const def = boss.def;
    this.burst(boss.x, boss.y, 28, def.color, 180);
    this.burst(boss.x, boss.y, 16, "#ffe56b", 120);
    this.shake = 14;
    if (def.keyId && !this.meta.keys.includes(def.keyId)) this.meta.keys.push(def.keyId);
    this.meta.maxFuel += def.tankBonus;
    if (def.salvage != null) this.meta.salvageRate = Math.max(this.meta.salvageRate, def.salvage);
    saveMeta(this.meta);
    this.fuel = Math.min(this.tankMax(), this.fuel + 14);
    this.energy = Math.min(this.energyMax(), this.energy + 14);
    sfxKey();
    const keyTxt = def.keyId ? titleKey(def.keyId) : "CLEAR";
    this.announce(`${def.name.toUpperCase()} DOWN — ${keyTxt}`);
    this.floaters.push({ x: boss.x, y: boss.y, text: keyTxt, life: 1.5, color: "#ffe56b" });
    this.bosses.set(def.planetId, "cleared");
    this.boss = null;
    this.markHud();
  }

  private collect(p: Pickup): void {
    sfxPickup();
    let label = "";
    let color = "#eef3ff";
    if (p.kind === "credits" || p.kind === "ore") {
      if (this.zone === "cavern") {
        this.diveCargo += p.value;
        label = p.kind === "ore" ? `+${p.value} ORE` : `+${p.value} CR`;
      } else {
        this.meta.credits += p.value;
        this.credits = this.meta.credits;
        this.runCredits += p.value;
        saveMeta(this.meta);
        label = `+${p.value} CR`;
      }
      color = "#ffd36b";
    } else if (p.kind === "fuel") {
      this.fuel = Math.min(this.tankMax(), this.fuel + p.value);
      label = "FUEL";
      color = "#ffe08a";
    } else if (p.kind === "energy") {
      this.energy = Math.min(this.energyMax(), this.energy + p.value);
      label = "ENERGY";
      color = "#7ee7ff";
    } else if (p.kind === "rapid") {
      this.gear.rapid = true;
      label = "RAPID";
      color = "#ff7ad9";
    } else if (p.kind === "twin") {
      this.gear.twin = true;
      label = "TWIN";
      color = "#9ad8ff";
    } else if (p.kind === "spread") {
      this.gear.spread = true;
      label = "SPREAD";
      color = "#c9a6ff";
    } else if (p.kind === "pet") {
      const added = this.spawnPet();
      label = added ? (this.pets.length > 1 ? "WINGMAN +" : "PET") : "+25 CR";
      color = added ? "#7dffb1" : "#ffd36b";
    }
    this.floaters.push({ x: p.x, y: p.y, text: label, life: 0.95, color });
    this.markHud();
  }

  private spawnPet(): boolean {
    if (this.pets.length >= MAX_PETS) {
      if (this.zone === "cavern") this.diveCargo += 25;
      else {
        this.runCredits += 25;
        this.meta.credits += 25;
        this.credits = this.meta.credits;
        saveMeta(this.meta);
      }
      return false;
    }
    const ship = this.ship;
    this.pets.push({
      x: ship.x - 30,
      y: ship.y,
      vx: 0,
      vy: 0,
      angle: ship.angle,
      cooldown: 0.2,
      phase: Math.random() * Math.PI * 2,
    });
    return true;
  }

  private breakRock(index: number, hx: number, hy: number): void {
    const rock = this.rocks[index];
    if (!rock) return;
    this.rocks.splice(index, 1);
    this.burst(hx, hy, 6 + rock.size * 3, "#ffb36b", 90 + rock.size * 24);
    this.shake = Math.max(this.shake, 3 + rock.size);
    sfxBoom(rock.size);

    if (this.comboLife > 0) this.combo = Math.min(8, this.combo + 1);
    else this.combo = 1;
    this.comboLife = 0.85;
    const pts = rockPoints(rock.size) * this.combo;
    this.score += pts;
    if (this.score > this.high) {
      this.high = this.score;
      this.meta.high = this.high;
      saveMeta(this.meta);
    }
    this.floaters.push({
      x: rock.x,
      y: rock.y,
      text: this.combo > 1 ? `${pts} x${this.combo}` : `${pts}`,
      life: 0.7,
      color: "#eef3ff",
    });
    this.markHud();

    if (rock.size > 1) {
      const a = Math.atan2(rock.vy, rock.vx) + Math.PI / 2;
      const kick = 42;
      for (const sign of [-1, 1]) {
        this.spawnRock(rock.size - 1, {
          x: rock.x + Math.cos(a) * 8 * sign,
          y: rock.y + Math.sin(a) * 8 * sign,
          vx: rock.vx + Math.cos(a) * kick * sign,
          vy: rock.vy + Math.sin(a) * kick * sign,
        });
      }
      this.capRocks();
    }

    if (this.zone === "space") this.maybeDrop(rock);
  }

  private maybeDrop(rock: Rock): void {
    const chance = rock.size >= 3 ? 0.22 : rock.size === 2 ? 0.32 : 0.48;
    if (Math.random() > chance) return;
    const roll = Math.random();
    let kind: LootKind;
    let value = 0;
    if (roll < 0.46) {
      kind = "credits";
      value = 4 + rock.size * 6 + Math.floor(Math.random() * 8);
    } else if (roll < 0.62) {
      kind = "energy";
      value = 16;
    } else if (roll < 0.74) {
      kind = "rapid";
    } else if (roll < 0.84) {
      kind = "twin";
    } else if (roll < 0.92) {
      kind = "spread";
    } else {
      kind = "pet";
    }
    const kick = Math.random() * Math.PI * 2;
    this.pickups.push({
      x: rock.x,
      y: rock.y,
      vx: Math.cos(kick) * 40,
      vy: Math.sin(kick) * 40,
      kind,
      life: kind === "credits" ? 12 : 14,
      value,
    });
  }

  private killShip(): void {
    const ship = this.ship;
    if (this.zone === "cavern" && this.fuel <= 0) {
      this.beginRescue();
      return;
    }
    this.burst(ship.x, ship.y, 18, "#7ee7ff", 150);
    this.burst(ship.x, ship.y, 10, "#ff6b8a", 110);
    this.shake = 12;
    sfxHit();
    this.lives -= 1;
    this.combo = 1;
    this.comboLife = 0;
    this.markHud();
    if (this.lives <= 0) {
      this.mode = "over";
      this.finalLine =
        this.runCredits > 0
          ? `Salvaged ${this.runCredits} credits from the field.`
          : "The field closed in. Come back hotter.";
      sfxOver();
      this.markHud();
      return;
    }
    if (this.cavern) {
      this.ship = this.freshShip(this.cavern.spawnX, this.cavern.spawnY);
      this.fuel = Math.max(this.fuel, Math.min(16, this.tankMax()));
    } else {
      this.ship = this.freshShip(ship.x, ship.y);
    }
    this.announce("HULL BREACH");
  }

  private checkWave(): void {
    if (this.mode !== "play" || this.zone !== "space") return;
    if (this.rocks.length > 0) return;
    this.wave += 1;
    this.ship.invuln = Math.max(this.ship.invuln, 1.2);
    this.spawnWave(this.wave);
    this.announce(`WAVE ${this.wave}`);
    sfxWave();
    this.markHud();
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    if (this.cavern) {
      ctx.fillStyle = this.cavern.deep;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    ctx.fillStyle = "#000108";
    ctx.fillRect(0, 0, w, h);
    const cool = ctx.createRadialGradient(w * 0.28, h * 0.22, 0, w * 0.28, h * 0.22, w * 0.85);
    cool.addColorStop(0, "rgba(48, 72, 128, 0.38)");
    cool.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cool;
    ctx.fillRect(0, 0, w, h);
    const warm = ctx.createRadialGradient(w * 0.78, h * 0.7, 0, w * 0.78, h * 0.7, w * 0.7);
    warm.addColorStop(0, "rgba(90, 32, 70, 0.28)");
    warm.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);
    this.drawStars(ctx);
  }

  private drawStars(ctx: CanvasRenderingContext2D): void {
    const t = performance.now() * 0.001;
    for (const star of this.stars) {
      const x = ((star.x * this.w - this.camX * star.z * 0.03) % this.w + this.w) % this.w;
      const y = ((star.y * this.h - this.camY * star.z * 0.03) % this.h + this.h) % this.h;
      const wave = 0.5 + 0.5 * Math.sin(t * star.speed + star.phase);
      const blink = Math.pow(wave, 3);
      const alpha = (0.12 + star.z * 0.55) * (0.2 + 1.15 * blink);
      ctx.globalAlpha = clamp(alpha, 0.04, 1);
      ctx.fillStyle = star.tint;
      const size = star.s * (0.7 + blink * 0.9);
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawPlanets(ctx: CanvasRenderingContext2D): void {
    for (const planet of PLANETS) {
      if (!this.inView(planet.x, planet.y, planet.radius + 80)) continue;
      const unlocked = this.isUnlocked(planet.id);
      ctx.save();
      ctx.globalAlpha = unlocked ? 1 : 0.48;
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius + 26, 0, Math.PI * 2);
      ctx.fillStyle = planet.atmosphere;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(planet.x, planet.y, planet.radius, 0, Math.PI * 2);
      ctx.fillStyle = planet.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(planet.x - planet.radius * 0.28, planet.y - planet.radius * 0.28, planet.radius * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fill();
      ctx.fillStyle = "#eef3ff";
      ctx.font = `700 ${this.worldFontPx(16)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(planet.name, planet.x, planet.y + planet.radius + 22 / this.zoom);
      if (!unlocked) {
        ctx.fillStyle = "#ffb36b";
        ctx.font = `700 ${this.worldFontPx(13)}px sans-serif`;
        ctx.fillText("LOCKED", planet.x, planet.y + planet.radius + 40 / this.zoom);
      }
      ctx.restore();
    }
  }

  private drawRock(ctx: CanvasRenderingContext2D, rock: Rock): void {
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.rot);
    ctx.beginPath();
    rock.verts.forEach((v, i) => {
      const a = (i / rock.verts.length) * Math.PI * 2;
      const x = Math.cos(a) * rock.radius * v;
      const y = Math.sin(a) * rock.radius * v;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = this.cavern ? "#0a0c10" : "#07080c";
    ctx.fill();
    ctx.lineWidth = Math.max(1.15, 2.15 / this.zoom);
    ctx.strokeStyle = rock.stroke;
    ctx.stroke();
    ctx.restore();
  }

  private drawBullet(ctx: CanvasRenderingContext2D, b: Bullet): void {
    ctx.fillStyle = b.team === "pet" ? "#7dffb1" : "#e8ffff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.team === "pet" ? 2 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPickup(ctx: CanvasRenderingContext2D, p: Pickup): void {
    const palette: Record<LootKind, { color: string; mark: string }> = {
      credits: { color: "#ffd36b", mark: "C" },
      ore: { color: "#ffb36b", mark: "O" },
      energy: { color: "#7ee7ff", mark: "E" },
      rapid: { color: "#ff7ad9", mark: "R" },
      twin: { color: "#9ad8ff", mark: "T" },
      spread: { color: "#c9a6ff", mark: "W" },
      pet: { color: "#7dffb1", mark: "P" },
      fuel: { color: "#ffe08a", mark: "F" },
    };
    const look = palette[p.kind];
    const pulse = 9 + Math.sin(performance.now() / 180) * 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = look.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (p.kind === "credits" || p.kind === "ore") {
      ctx.moveTo(0, -pulse);
      ctx.lineTo(pulse * 0.7, 0);
      ctx.lineTo(0, pulse);
      ctx.lineTo(-pulse * 0.7, 0);
      ctx.closePath();
    } else {
      ctx.arc(0, 0, pulse, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.fillStyle = look.color;
    ctx.font = "700 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(look.mark, 0, 1);
    ctx.restore();
  }

  private drawSpark(ctx: CanvasRenderingContext2D, s: Spark): void {
    const a = clamp(s.life / s.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.size, s.size);
    ctx.globalAlpha = 1;
  }

  private drawPet(ctx: CanvasRenderingContext2D, pet: Pet): void {
    ctx.save();
    ctx.translate(pet.x, pet.y);
    ctx.rotate(pet.angle);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, -6);
    ctx.closePath();
    ctx.fillStyle = "#07140e";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#7dffb1";
    ctx.stroke();
    ctx.restore();
  }

  private drawShip(ctx: CanvasRenderingContext2D): void {
    const ship = this.ship;
    if (ship.invuln > 0 && Math.floor(ship.invuln * 12) % 2 === 0) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    if (ship.shielding) {
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(126, 231, 255, 0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, 9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, -9);
    ctx.closePath();
    ctx.fillStyle = "#0b1218";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.gear.rapid ? "#ff7ad9" : this.gear.spread ? "#c9a6ff" : "#7ee7ff";
    ctx.stroke();
    if (ship.thrusting || ship.reversing) {
      const dir = ship.reversing ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(dir * 8, -4);
      ctx.lineTo(dir * (16 + Math.random() * 5), 0);
      ctx.lineTo(dir * 8, 4);
      ctx.fillStyle = "#ffc14d";
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFloater(ctx: CanvasRenderingContext2D, f: Floater): void {
    ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  private drawWorldNav(ctx: CanvasRenderingContext2D): void {
    if (this.mode === "menu") return;
    if (this.zone === "cavern" && this.boss?.alive) {
      ctx.save();
      ctx.strokeStyle = this.boss.def.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(1.5, 3 / this.zoom);
      ctx.setLineDash([12 / this.zoom, 10 / this.zoom]);
      ctx.beginPath();
      ctx.moveTo(this.ship.x, this.ship.y);
      ctx.lineTo(this.boss.x, this.boss.y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (this.zone !== "space") return;
    const planet = this.closestPlanet();
    ctx.save();
    ctx.strokeStyle = planet.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1.5, 3 / this.zoom);
    ctx.setLineDash([12 / this.zoom, 10 / this.zoom]);
    ctx.beginPath();
    ctx.moveTo(this.ship.x, this.ship.y);
    ctx.lineTo(planet.x, planet.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawBanner(ctx: CanvasRenderingContext2D): void {
    if (!this.banner || this.mode === "menu") return;
    ctx.globalAlpha = clamp(this.bannerLife, 0, 1);
    ctx.fillStyle = "#eef3ff";
    ctx.font = "700 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.banner, this.w / 2, this.h * 0.22);
    ctx.globalAlpha = 1;
  }

  private drawNavMarker(ctx: CanvasRenderingContext2D): void {
    if (this.mode === "menu" || this.mode === "over") return;
    if (this.zone === "cavern" && this.boss?.alive) {
      this.drawEdgeMarker(ctx, this.boss.x, this.boss.y, this.boss.def.color, this.boss.def.name);
      return;
    }
    if (this.zone !== "space") return;
    const planet = this.closestPlanet();
    const sx = (planet.x - this.camX) * this.zoom;
    const sy = (planet.y - this.camY) * this.zoom;
    const pad = 56;
    const onScreen =
      sx > pad && sx < this.w - pad && sy > pad && sy < this.h - pad - 140;
    const dx = planet.x - this.ship.x;
    const dy = planet.y - this.ship.y;
    const dist = Math.hypot(dx, dy);
    if (onScreen) {
      // Name / LOCKED already come from drawPlanets. Re-entry is the HTML
      // #prompt — a second "{name} · E" in screen space at 14/zoom explodes
      // at ZOOM_MIN. Keep the off-screen arrow + distance only.
      return;
    }
    this.drawEdgeMarker(ctx, planet.x, planet.y, planet.color, `${planet.name}  ${Math.round(dist)}`);
  }

  /** World-space font that stays a fixed screen-pixel size at any zoom. */
  private worldFontPx(screenPx: number, minPx = 12, maxPx = 18): number {
    return clamp(screenPx, minPx, maxPx) / this.zoom;
  }

  private drawEdgeMarker(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    color: string,
    label: string,
  ): void {
    const sx = (wx - this.camX) * this.zoom;
    const sy = (wy - this.camY) * this.zoom;
    const pad = 56;
    const onScreen = sx > pad && sx < this.w - pad && sy > pad && sy < this.h - pad - 140;
    if (onScreen) return;
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const ang = Math.atan2(sy - cy, sx - cx);
    const rx = this.w / 2 - pad;
    const ry = this.h / 2 - pad;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const tx = cos === 0 ? Infinity : rx / Math.abs(cos);
    const ty = sin === 0 ? Infinity : ry / Math.abs(sin);
    const t = Math.min(tx, ty);
    const x = cx + cos * t;
    const y = cy + sin * t;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-8, -9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#eef3ff";
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelY = y > this.h - 90 ? y - 28 : y + 16;
    ctx.fillText(label, x, labelY);
  }

  private drawMinimap(ctx: CanvasRenderingContext2D): void {
    const mw = 168;
    const mh = 126;
    const pad = 16;
    const x = pad;
    const y = this.h - mh - pad;
    ctx.save();
    ctx.fillStyle = "rgba(6, 8, 14, 0.78)";
    ctx.strokeStyle = "rgba(126, 231, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, mw, mh);
    ctx.strokeRect(x, y, mw, mh);

    if (this.cavern) {
      ctx.drawImage(this.cavern.minimap, x, y, mw, mh);
      const sx = mw / this.cavern.width;
      const sy = mh / this.cavern.height;
      ctx.strokeStyle = "rgba(238, 243, 255, 0.28)";
      ctx.strokeRect(x + this.camX * sx, y + this.camY * sy, this.viewW() * sx, this.viewH() * sy);
      ctx.fillStyle = "#7ee7ff";
      ctx.fillRect(x + this.ship.x * sx - 2, y + this.ship.y * sy - 2, 4, 4);
      if (this.boss?.alive) {
        ctx.fillStyle = this.boss.def.color;
        ctx.beginPath();
        ctx.arc(x + this.boss.x * sx, y + this.boss.y * sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const sx = mw / SPACE_W;
      const sy = mh / SPACE_H;
      ctx.strokeStyle = "rgba(238, 243, 255, 0.22)";
      ctx.strokeRect(x + this.camX * sx, y + this.camY * sy, this.viewW() * sx, this.viewH() * sy);
      for (const planet of PLANETS) {
        ctx.fillStyle = planet.color;
        ctx.beginPath();
        ctx.arc(x + planet.x * sx, y + planet.y * sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#9aa6bf";
      for (const rock of this.rocks) {
        ctx.fillRect(x + rock.x * sx, y + rock.y * sy, 2, 2);
      }
      ctx.fillStyle = "#7ee7ff";
      ctx.beginPath();
      ctx.arc(x + this.ship.x * sx, y + this.ship.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
      const nav = this.closestPlanet();
      ctx.strokeStyle = "#7ee7ff";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x + this.ship.x * sx, y + this.ship.y * sy);
      ctx.lineTo(x + nav.x * sx, y + nav.y * sy);
      ctx.stroke();
      ctx.fillStyle = nav.color;
      ctx.beginPath();
      ctx.arc(x + nav.x * sx, y + nav.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
