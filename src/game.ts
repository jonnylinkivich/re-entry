import {
  sfxBeacon,
  sfxBoom,
  sfxBossHit,
  sfxBuy,
  sfxFold,
  sfxFuelLow,
  sfxBack,
  sfxHit,
  sfxKey,
  sfxOver,
  sfxPickup,
  sfxReentry,
  sfxRescue,
  sfxShield,
  sfxShoot,
  sfxThrust,
  sfxThud,
  sfxWave,
  audioSnapshot,
  setMusicBed,
  setMuted,
  toggleMuted,
} from "./audio.ts";
import { BOSS_BY_PLANET, PlanetBoss } from "./boss.ts";
import {
  BEACONS,
  DOCK_RANGE,
  MAP_SCALE,
  HOLES,
  PLANETS,
  SPACE_H,
  SPACE_W,
  SPAWN_CLEARANCE,
  STATION,
  type BeaconDef,
  type HoleDef,
  type Cavern,
  type PlanetDef,
  circleHitsSolid,
  drawCavern,
  bossApproach,
  emptySpots,
  generateCavern,
  inExitShaft,
  moveAgainst,
} from "./cavern.ts";
import { PlanetSplash, ReentryCine, RescueCine } from "./cinematic.ts";
import {
  ALL_PLANET_KEYS,
  CHART_CELLS,
  CHART_COLS,
  CHART_ROWS,
  ENERGY_DRAIN,
  ENERGY_HIT,
  ENGINES_MAX,
  FUEL_IDLE,
  FUEL_THRUST,
  RESCUE_FEE,
  START_MAX_ENERGY,
  chartFromString,
  chartIndex,
  chartToString,
  gateObjective,
  loadMeta,
  lockPrompt,
  markChart,
  neededKey,
  planetUnlocked,
  playtestFlags,
  salvageLabel,
  saveMeta,
  titleKey,
  type MetaState,
} from "./meta.ts";
import {
  SHOP_CELL_CAP,
  SHOP_CELL_STEP,
  SHOP_TANK_CAP,
  SHOP_TANK_STEP,
  buildShopRows,
  type ShopId,
  type ShopRow,
} from "./shop.ts";

export type Mode = "menu" | "play" | "pause" | "over" | "cine" | "shop";
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
  promptDock: boolean;
  shopRows: ShopRow[];
  shopHint: string;
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
  muzzle: number;
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
  neon: boolean;
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

/** Screen-space neon ring. Death stays where the hull broke; back follows the ship. */
type HullFlash = {
  sx: number;
  sy: number;
  life: number;
  max: number;
  delay: number;
  kind: "death" | "back";
};

/** World-space accent ring. One stroke on a paid diamond, then it is gone. */
type BeaconPop = {
  x: number;
  y: number;
  life: number;
  max: number;
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
  /** Screen pixels of drift per world unit. Tuned so full cruise still reads as parallax, not a streak. */
  parallax: number;
  cross: boolean;
};
type Dust = { x: number; y: number; parallax: number; tint: string };
type Nebula = { x: number; y: number; r: number; inner: string; outer: string };
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
const MAX_SPEED_CAVE = 390;
const SPACE_DRAG = 0.32;
const CAVE_DRAG = 0.12;
/**
 * Hab-7 engines (meta.engines, 0..ENGINES_MAX). The 640k ladder is scaled
 * onto this field so the crossing times stay the same:
 *   level 0 = 880 * MAP_SCALE = 8800 u/s   (~12.1 min on the long axis)
 *   level 5 = SPACE_W / 300     = 21333 u/s (exactly 300s)
 * Thrust scales from the old 360 u/s² at 880 u/s, so SPACE_DRAG 0.32 still
 * lets a held burn sit on the cap. Caverns keep THRUST and MAX_SPEED_CAVE.
 */
const STOCK_SPEED_SPACE = 880 * MAP_SCALE;
const ENGINES_SPEED_CAP = SPACE_W / 300;
const BULLET_SPEED = 620;
const BULLET_LIFE = 1.05;
/** Shield-hit ring pulse. The hull blink from `invuln` stays the hit FX. */
const SHIELD_PULSE = 0.22;
/** Owned-gun muzzle stroke. Short enough that rapid fire does not smear. */
const MUZZLE_FLASH = 0.055;
const MAX_PETS = 2;
const MAX_ROCKS = 40;
const MAX_SPARKS = 48;
const EMPTY_SHOP: ShopRow[] = [];
const PICKUP_LOOK: Record<LootKind, { color: string; mark: string }> = {
  credits: { color: "#ffd36b", mark: "C" },
  ore: { color: "#ffb36b", mark: "O" },
  energy: { color: "#7ee7ff", mark: "E" },
  rapid: { color: "#ff7ad9", mark: "R" },
  twin: { color: "#9ad8ff", mark: "T" },
  spread: { color: "#c9a6ff", mark: "W" },
  pet: { color: "#7dffb1", mark: "P" },
  fuel: { color: "#ffe08a", mark: "F" },
};
/**
 * Old floor was 0.015 on the 640k map (~13% of the width on a 1280px window).
 * 0.008 / MAP_SCALE keeps that fraction and opens it a little so a planet hop
 * can fit when zoomed all the way out. Intro zoom is wide enough that Cinder
 * (SPAWN_CLEARANCE off the ship) and a boosted ship glyph share a 1280px frame.
 */
const ZOOM_MIN = 0.008 / MAP_SCALE;
const ZOOM_MAX = 3.6;
/** Combat zoom used as a recovery target if the camera zoom goes non-finite. */
const ZOOM_START = 1.28;
/** Wide intro so Cinder and the ship share a 1280px frame on the 6.4M map. */
const SPACE_INTRO_ZOOM = 0.34 / MAP_SCALE;
/** Halo from the planet surface. `nearestPlanet` adds `radius`, so the prompt is local. */
const REENTRY_RANGE = 520;
/** Away-spawns must stay this far from the ship (world clamp used to drop rocks on you). */
const ROCK_CLEAR_R = 1800;
/** Void-fold well. Visual core stays a landmark; the pull is the thing you fly into. */
const HOLE_VISUAL_R = 64;
const HOLE_PULL_R = 7200;
const HOLE_CAPTURE_R = 1600;
const HOLE_EXIT = 2800;
const HOLE_LOCK = 3.2;
const HOLE_EXIT_SPEED = 1600;
/** Capture edge flash, then the arrival pop. Visual only — fold routing is unchanged. */
const FOLD_FLASH = 0.28;
const FOLD_POP = 0.5;
/** Rim + streak when the cine hands off into the shaft. Visual only. */
const DIVE_FLASH = 0.36;
/**
 * One-shot accent ring on the space chart the first time this run records a planet.
 * Silent. The clock starts when the chart is on screen, so a cavern dive does not burn it.
 */
const CHART_PLANET_PULSE_MS = 1100;
/**
 * Soft breathe on the cavern boss pip and edge arrow. ~1.65s.
 * Silent. Stops as soon as that boss is no longer alive on this dive.
 */
const BOSS_RADAR_PULSE = 0.0038;
/**
 * Cavern radar sits above the fuel meters. The flight pads cover the
 * bottom-left corner, which is where the boss pip would otherwise land.
 */
const CAVERN_RADAR_LIFT = 260;
/** Hull-breach shatter, then the return pop. Screen strokes, not a new particle system. */
const HULL_FLASH = 0.44;
const HULL_POP = 0.36;
/**
 * Salvage landmarks on the 6.4M field. The ring is the cruise-scale read
 * (a thin stroke, not a gradient). The core is the fly-through.
 * +1 CR / +2 fuel — a full sweep is at most one credit per beacon.
 */
const BEACON_RING_R = 120_000;
const BEACON_CORE_R = 72;
const BEACON_COLLECT_R = 4200;
/**
 * Cruise-scale read for Hab-7. A thin cyan pulse on the station, not a dock radius.
 * `nearStation` stays `STATION.radius + DOCK_RANGE`. Hidden once zoomed into combat,
 * same cutoff as the salvage rings, so the silhouette stays the close read.
 */
const HAB_RING_R = 100_000;
const BEACON_SCRAP = 1;
const BEACON_FUEL = 2;
/** Accent ring when a diamond pays. Stroke only; the ping stays `sfxBeacon`. */
const BEACON_POP = 0.42;
/** Lethal only for a *new* wall slam — not grinding the same surface. */
const WALL_SLAM = 420;
const RESCUE_FUEL = 24;
const TRANSIT_LOCK = 2.4;
/** Held Space auto-repeats into the re-entry skip. Let the sell play this long. */
const REENTRY_SPACE_GRACE = 0.4;
/**
 * First Cinder dive only (no key yet). Starter tank is 40; holding thrust
 * coasts short of Ember Warden. Two cans on the carved shaft, not a saved
 * tank bump — later worlds still dry out into the rescue beam.
 */
const CINDER_SHAFT_FUEL = 28;
const CINDER_SHAFT_AT = [0.2, 0.78];
/** Cavern rocks keep this palette. Open space uses cyan / orange below. */
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
/**
 * Space-rock outlines, as radius scales at equal angles.
 * Spike, splinter, and kite — far enough apart to read at the intro boost.
 * Draw-only: the hit circle is still `rock.radius`.
 */
const ROCK_SILHOUETTES: readonly (readonly number[])[] = [
  [1.06, 0.26, 1.02, 0.22, 1.08, 0.28, 1.0, 0.2],
  [1.14, 0.18, 0.16, 1.08, 0.18, 0.14],
  [1.02, 0.72, 0.96, 0.66],
];

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/** Cavern tank fraction where the fuel chip starts pulsing. Readability only. */
export const FUEL_LOW_RATIO = 0.2;
/** Stronger flash at this fraction and when the tank is empty. */
export const FUEL_CRIT_RATIO = 0.08;

export type FuelBand = "ok" | "low" | "critical";

/** Below 20% pulses. At 8% and at empty the chip flashes harder. Burn rates are untouched. */
export function fuelBand(fuel: number, maxFuel: number): FuelBand {
  if (!(maxFuel > 0) || !Number.isFinite(fuel)) return "ok";
  if (fuel <= 0 || fuel / maxFuel <= FUEL_CRIT_RATIO) return "critical";
  if (fuel / maxFuel < FUEL_LOW_RATIO) return "low";
  return "ok";
}

function enginesLevel(level: number): number {
  return clamp(Math.floor(level) || 0, 0, ENGINES_MAX);
}

/** Space speed cap at this engines level. Level 0 is stock; level 5 is SPACE_W / 300. */
function spaceMaxSpeed(level: number): number {
  const t = enginesLevel(level) / ENGINES_MAX;
  return STOCK_SPEED_SPACE + (ENGINES_SPEED_CAP - STOCK_SPEED_SPACE) * t;
}

/** Space thrust. Same ratio as 360 u/s² at 880 u/s on the old chart. */
function spaceThrust(level: number): number {
  return THRUST * (spaceMaxSpeed(level) / 880);
}

function segmentNear(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-6) t = clamp(((cx - x0) * dx + (cy - y0) * dy) / len2, 0, 1);
  const px = x0 + dx * t - cx;
  const py = y0 + dy * t - cy;
  return px * px + py * py <= radius * radius;
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

/**
 * Seeded space outline. Consecutive spawn seeds cycle the three families so
 * the opening wave cannot be one blob. Jitter and stroke come from a side
 * stream and do not touch placement RNG.
 */
function rockSilhouette(seed: number): { verts: number[]; stroke: string } {
  const rand = mulberry(seed ^ 0x51e0d);
  const shape = (seed >>> 0) % ROCK_SILHOUETTES.length;
  const template = ROCK_SILHOUETTES[shape] ?? ROCK_SILHOUETTES[0];
  const verts: number[] = [];
  for (let i = 0; i < template.length; i++) {
    verts.push((template[i] ?? 1) * (0.94 + rand() * 0.1));
  }
  return { verts, stroke: rand() < 0.5 ? "#7ee7ff" : "#ff6b3d" };
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
  private hullFlashes: HullFlash[] = [];
  private pickups: Pickup[] = [];
  private pets: Pet[] = [];
  private floaters: Floater[] = [];
  private stars: Star[] = [];
  private dust: Dust[] = [];
  private nebulae: Nebula[] = [];
  /** Pixel-snapped camera origin. World draws subtract this in float64. */
  private renderOx = 0;
  private renderOy = 0;
  private keys = new Set<string>();
  /** Analog virtual stick. Keyboard flight does not write these. */
  private stickTurn = 0;
  private stickThrust = 0;
  private pointer: Pointer | null = null;
  private fireHeld = false;
  private queuedFire = false;
  private shake = 0;
  private shieldPulse = 0;
  private bannerLife = 0;
  private comboLife = 0;
  private thrustSfx = 0;
  private hudDirty = true;
  private seed = 1;
  private camX = 0;
  private camY = 0;
  private zoom = ZOOM_START;
  private zoomWanted = ZOOM_START;
  private viewRight = 0;
  private viewBottom = 0;
  private loadoutCached: string[] = [];
  private loadoutCacheKey = "";
  private nebulaCool: CanvasGradient | null = null;
  private nebulaWarm: CanvasGradient | null = null;
  private nebulaKey = "";
  private fpsEma = 60;
  private showFps = false;
  private liveHud: HudSnapshot | null = null;
  private fuel = 0;
  /** True after the low-fuel blip until the tank climbs back to 20% or the dive ends. */
  private fuelWarnLatched = false;
  private energy = 0;
  private diveCargo = 0;
  private prompt = "";
  private shopHint = "";
  private planet: PlanetDef | null = null;
  private cavern: Cavern | null = null;
  private caverns = new Map<string, Cavern>();
  private diveHolds = new Map<string, DiveHold>();
  private bosses = new Map<string, PlanetBoss | "cleared">();
  private boss: PlanetBoss | null = null;
  private spaceHold: SpaceHold | null = null;
  private cine: ReentryCine | RescueCine | PlanetSplash | null = null;
  private cineKind: "splash" | "reentry" | "rescue" | null = null;
  private reentrySpaceGrace = 0;
  private pendingPlanet: PlanetDef | null = null;
  private meta: MetaState;
  private runBoost = false;
  private runUnlock = false;
  private wallGrind = false;
  private transitLock = 0;
  /** Consume E/Enter until release so a hold can still fire once we reach a halo. */
  private interactLatch = false;
  private holeLock = 0;
  /** Screen-edge grab flash, then the arrival ring. Seconds left. */
  private foldFlash = 0;
  private foldPop = 0;
  private diveFlash = 0;
  /** One bit per beacon. Pays once per run; the mark stays up either way. */
  private beaconSpent = new Uint8Array(BEACONS.length);
  /** Paid-diamond rings. Visual only — mute still gates `sfxBeacon`. */
  private beaconPops: BeaconPop[] = [];
  private chart = chartFromString("");
  /** Planet ids written to visitedPlanets this run, waiting for the space chart. */
  private chartPulseArmed = new Set<string>();
  /** performance.now() when that planet's chart ring started. */
  private chartPulseAt = new Map<string, number>();
  private startAt = -1e9;

  constructor() {
    this.meta = loadMeta();
    this.chart = chartFromString(this.meta.visited);
    setMuted(this.meta.muted);
    this.credits = this.meta.credits;
    this.high = this.meta.high;
    this.fuel = this.meta.maxFuel;
    this.energy = this.meta.maxEnergy;
    this.ship = this.freshShip(SPACE_W * 0.5, SPACE_H * 0.5);
    this.showFps = playtestFlags().boost;
    this.snapCam();
    this.rebuildStars();
    this.rebuildNebulae();
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
      else if (this.mode === "shop") this.closeShop();
      else if (this.mode === "play") this.tryTransit();
    }
    if (code === "KeyE") {
      if (this.mode === "cine") this.skipCine();
      else if (this.mode === "menu" || this.mode === "over") this.start();
      else if (this.mode === "play") this.tryTransit();
    }
    if (code === "KeyR" && this.mode === "play") this.tryRescue();
    if (code === "KeyM") this.toggleMute();
    if (code === "Space") {
      if (this.mode === "cine") {
        if (
          (this.cineKind === "reentry" || this.cineKind === "splash") &&
          this.reentrySpaceGrace > 0
        ) {
          this.keys.delete("Space");
          return;
        }
        this.skipCine();
      } else if (this.mode === "menu" || this.mode === "over") this.start();
    }
    if (code === "Escape" || code === "KeyP") {
      if (this.mode === "cine") this.skipCine();
      else if (this.mode === "shop") this.closeShop();
      else if (this.mode === "play") this.pause();
      else if (this.mode === "pause") this.resume();
    }
  }

  /**
   * Virtual-stick axes, each -1..1. Turn is left-negative. Thrust is forward-positive.
   * Separate from `keys` so a stick release cannot drop a held A/D/W/S.
   */
  setStick(turn: number, thrust: number): void {
    this.stickTurn = clamp(turn, -1, 1);
    this.stickThrust = clamp(thrust, -1, 1);
  }

  clearPads(): void {
    this.stickTurn = 0;
    this.stickThrust = 0;
  }

  private held(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
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

  /** Speaker chip and M. Persists on the save and announces the new state. */
  toggleMute(): void {
    this.meta.muted = toggleMuted();
    saveMeta(this.meta);
    this.announce(this.meta.muted ? "MUTED" : "SOUND ON");
  }

  pulseFire(): void {
    if (this.mode === "cine") {
      this.skipCine();
      return;
    }
    this.queuedFire = true;
    if (this.mode !== "play" || this.zone !== "space" || !this.pointer) return;
    const stationReach = STATION.radius + 56;
    if (dist2(this.pointer.x, this.pointer.y, STATION.x, STATION.y) < stationReach * stationReach) {
      if (this.nearStation()) this.openShop();
      return;
    }
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
    const now = performance.now();
    if ((this.mode === "play" || this.mode === "cine") && now - this.startAt < 500) return;
    this.startAt = now;
    this.mode = "play";
    this.zone = "space";
    this.planet = null;
    this.cavern = null;
    this.spaceHold = null;
    this.cine = null;
    this.cineKind = null;
    this.reentrySpaceGrace = 0;
    this.pendingPlanet = null;
    this.wallGrind = false;
    this.transitLock = 0;
    this.interactLatch = false;
    this.score = 0;
    this.lives = MAX_LIVES;
    this.wave = 1;
    this.combo = 1;
    this.comboLife = 0;
    this.runCredits = 0;
    this.diveCargo = 0;
    this.prompt = "";
    this.shopHint = "";
    this.gear = { rapid: false, twin: false, spread: false };
    this.bullets = [];
    this.sparks = [];
    this.hullFlashes = [];
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
    this.showFps = flags.boost;
    if (this.runBoost) {
      this.meta.credits = Math.max(this.meta.credits, 80);
      saveMeta(this.meta);
    }
    this.credits = this.meta.credits;
    this.fuel = this.runBoost ? Math.max(this.meta.maxFuel, 120) : this.meta.maxFuel;
    this.fuelWarnLatched = false;
    this.energy = this.runBoost ? Math.max(this.meta.maxEnergy, 80) : this.meta.maxEnergy;
    this.zoom = SPACE_INTRO_ZOOM;
    this.zoomWanted = SPACE_INTRO_ZOOM;
    const home = PLANETS[0];
    this.ship = this.freshShip(home.x + home.radius + SPAWN_CLEARANCE, home.y);
    this.ship.angle = Math.PI;
    this.holeLock = 0;
    this.foldFlash = 0;
    this.foldPop = 0;
    this.diveFlash = 0;
    this.beaconSpent.fill(0);
    this.beaconPops = [];
    this.chartPulseArmed.clear();
    this.chartPulseAt.clear();
    this.noteVisit();
    this.applyMetaLoadout();
    this.rocks = [];
    this.seed = (Math.random() * 1e9) | 0;
    this.snapCam();
    this.spawnWave(this.wave);
    this.clearHazardsNearShip(this.wave <= 1 ? 70 : ROCK_CLEAR_R);
    this.announce("CINDER AHEAD");
    sfxWave();
    this.syncMusic();
    this.bindPlaytestHooks();
    this.markHud();
  }

  /** Silent menu. Full bed in play. Duck under pause, shop, cine, and game over. */
  private syncMusic(): void {
    if (this.mode === "menu") setMusicBed("off");
    else if (this.mode === "play") setMusicBed("play");
    else setMusicBed("soft");
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

  openShop(): void {
    if (this.mode !== "play" || this.zone !== "space" || !this.nearStation()) return;
    this.mode = "shop";
    this.shopHint = "";
    this.keys.delete("KeyE");
    this.keys.delete("Enter");
    this.interactLatch = true;
    this.markHud();
  }

  /** Prompt tap / click — same as E when a re-entry, dock, or launch halo is live. */
  interact(): void {
    if (this.mode !== "play") return;
    if (this.zone === "cavern" && this.fuel <= 0) {
      this.tryRescue();
      return;
    }
    this.tryTransit();
  }

  closeShop(): void {
    if (this.mode !== "shop") return;
    this.mode = "play";
    this.shopHint = "";
    this.markHud();
  }

  buyShop(id: string): void {
    if (this.mode !== "shop") return;
    const row = this.shopRows().find((item) => item.id === id);
    if (!row) return;
    if (row.status === "owned") {
      this.shopHint = `${row.name} already owned`;
      this.markHud();
      return;
    }
    if (row.status === "full") {
      this.shopHint = `${row.name} is maxed`;
      this.markHud();
      return;
    }
    if (row.status === "broke") {
      this.shopHint = `Need ${row.missing} more CR for ${row.name}`;
      this.markHud();
      return;
    }
    if (!this.spendPurse(row.price)) {
      this.shopHint = `Need ${row.price} CR`;
      this.markHud();
      return;
    }
    this.applyShopBuy(row.id);
    this.shopHint = `${row.name} installed`;
    this.announce(row.name.toUpperCase());
    sfxBuy();
    this.markHud();
  }

  hud(): HudSnapshot {
    const snap = this.liveHud ?? (this.liveHud = {
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
      sector: "",
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
      promptDock: this.prompt.startsWith("Dock"),
      shopRows: EMPTY_SHOP,
      shopHint: this.shopHint,
    });
    snap.mode = this.mode;
    snap.score = this.score;
    snap.high = this.high;
    snap.lives = this.lives;
    snap.wave = this.wave;
    snap.combo = this.combo;
    snap.maxLives = MAX_LIVES;
    snap.credits = this.credits;
    snap.runCredits = this.runCredits;
    snap.banner = this.banner;
    snap.finalLine = this.finalLine;
    snap.loadout = this.loadoutLabels();
    snap.sector = this.planet ? this.planet.name.toUpperCase() : `SPACE · W${this.wave}`;
    snap.fuel = this.fuel;
    snap.maxFuel = this.tankMax();
    snap.energy = this.energy;
    snap.maxEnergy = this.energyMax();
    snap.cargo = this.diveCargo;
    snap.salvageRate = this.meta.salvageRate;
    snap.objective = this.objectiveText();
    snap.shielding = this.ship.shielding;
    snap.muted = this.meta.muted;
    snap.zone = this.zone;
    snap.prompt = this.prompt;
    snap.promptDock = this.prompt.startsWith("Dock");
    snap.shopRows = this.mode === "shop" ? this.shopRows() : EMPTY_SHOP;
    snap.shopHint = this.shopHint;
    return snap;
  }

  update(dt: number): void {
    this.syncMusic();
    const t = clamp(dt, 0, 0.05);
    this.transitLock = Math.max(0, this.transitLock - t);
    if (!this.motionOk()) this.sanitizeView();
    this.fpsEma = this.fpsEma * 0.9 + (1 / Math.max(t, 1 / 240)) * 0.1;
    this.shake = Math.max(0, this.shake - t * 22);
    this.foldFlash = Math.max(0, this.foldFlash - t);
    this.foldPop = Math.max(0, this.foldPop - t);
    this.diveFlash = Math.max(0, this.diveFlash - t);
    this.stepBeaconPops(t);
    if (this.bannerLife > 0) {
      this.bannerLife -= t;
      if (this.bannerLife <= 0) this.banner = "";
    }

    if (this.cine) {
      this.reentrySpaceGrace = Math.max(0, this.reentrySpaceGrace - t);
      this.cine.update(t);
      if (this.cine.done) this.finishCine();
      return;
    }

    if (this.mode === "pause" || this.mode === "over" || this.mode === "shop") {
      this.driftDecor(t * 0.35);
      this.stepSparks(t);
      this.stepHullFlashes(t);
      this.followCam(t);
      return;
    }

    if (this.mode === "menu") {
      this.driftDecor(t);
      this.stepSparks(t);
      this.stepHullFlashes(t);
      this.followCam(t);
      return;
    }

    this.stepShip(t);
    this.stepPets(t);
    this.stepBullets(t);
    this.stepRocks(t);
    this.stepPickups(t);
    this.stepSparks(t);
    this.stepHullFlashes(t);
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
    this.updateInteract();
    this.noteFuelWarn();
    if (this.zone === "space") this.checkWave();

    if (this.hudDirty) {
      this.hudDirty = false;
      this.onHud?.(this.hud());
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.motionOk()) this.sanitizeView();
    if (!this.motionOk()) return;
    if (this.cine) {
      this.cine.draw(ctx, this.w, this.h);
      return;
    }
    this.drawBackdrop(ctx);

    this.refreshView();
    ctx.save();
    if (this.shake > 0.4) {
      const mag = this.shake * 0.7;
      const a = this.shake * 37.1;
      ctx.translate(Math.sin(a) * mag, Math.cos(a * 1.31) * mag);
    }
    const z = this.zoom;
    // Camera-local render. Subtracting the snapped camera in float64 keeps
    // every canvas coordinate near the view, so the float32 CTM never holds
    // a multi-million translation (that was the 6.4M-map jitter).
    this.beginWorldCamera(ctx);

    if (this.cavern) {
      drawCavern(ctx, this.cavern, this.camX, this.camY, this.w / z, this.h / z, z, this.renderOx, this.renderOy);
    } else {
      this.drawBeacons(ctx);
      this.drawPlanets(ctx);
      this.drawStation(ctx);
      this.drawHoles(ctx);
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
    for (const pet of this.pets) {
      if (this.inView(pet.x, pet.y, 16)) this.drawPet(ctx, pet);
    }
    if (this.boss?.alive && this.inView(this.boss.x, this.boss.y, this.boss.def.radius + 80)) {
      this.boss.draw(ctx, this.zoom, this.renderOx, this.renderOy);
    }
    if (this.mode !== "menu") this.drawShip(ctx);
    if (!this.cavern) this.drawBeaconPops(ctx);
    for (const floater of this.floaters) {
      if (this.inView(floater.x, floater.y, 40)) this.drawFloater(ctx, floater);
    }

    ctx.restore();
    this.drawHoleTelegraph(ctx);
    this.drawFoldFx(ctx);
    this.drawDiveFlash(ctx);
    this.drawHullFlashes(ctx);
    this.drawSpaceLabels(ctx);
    this.drawBanner(ctx);
    this.drawNavMarker(ctx);
    if (this.mode === "pause" && !this.cavern) this.drawPauseChart(ctx);
    else if (this.mode !== "menu") this.drawMinimap(ctx);
    if (this.showFps) this.drawFps(ctx);
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
    const keys = this.ownedKeys();
    const key = `${this.gear.twin ? 1 : 0}${this.gear.spread ? 1 : 0}${this.gear.rapid ? 1 : 0}${this.ship.shielding ? 1 : 0}:${this.pets.length}:${this.tankMax()}:${this.meta.salvageRate}:${this.flightEngines()}:${keys.join(",")}`;
    if (key === this.loadoutCacheKey) return this.loadoutCached;
    const tags: string[] = [];
    if (this.gear.twin) tags.push("Twin");
    if (this.gear.spread) tags.push("Spread");
    if (this.gear.rapid) tags.push("Rapid");
    if (this.ship.shielding) tags.push("Shield");
    if (this.pets.length === 1) tags.push("Pet");
    if (this.pets.length > 1) tags.push(`${this.pets.length} Pets`);
    tags.push(`Tank ${Math.round(this.tankMax())}`);
    if (this.flightEngines() > 0) tags.push(`Mk ${this.flightEngines()}`);
    tags.push(salvageLabel(this.meta.salvageRate));
    tags.push(`Cruise ${Math.round(spaceMaxSpeed(this.flightEngines()))}`);
    for (const id of keys) {
      if (id === "helix") tags.push("Helix Clear");
      else tags.push(titleKey(id));
    }
    this.loadoutCacheKey = key;
    this.loadoutCached = tags;
    return tags;
  }

  private tankMax(): number {
    return this.runBoost ? Math.max(this.meta.maxFuel, 120) : this.meta.maxFuel;
  }

  private energyMax(): number {
    return this.runBoost ? Math.max(this.meta.maxEnergy, 80) : this.meta.maxEnergy;
  }

  private ownedKeys(): string[] {
    if (this.runUnlock) return [...ALL_PLANET_KEYS];
    return this.meta.keys;
  }

  private applyMetaLoadout(): void {
    this.gear = {
      rapid: this.meta.rapid,
      twin: this.meta.twin,
      spread: this.meta.spread,
    };
    this.pets = [];
    const n = Math.min(MAX_PETS, this.meta.pets);
    for (let i = 0; i < n; i++) this.addPetBody();
  }

  private persistLoadout(): void {
    this.meta.rapid = this.gear.rapid;
    this.meta.twin = this.gear.twin;
    this.meta.spread = this.gear.spread;
    this.meta.pets = this.pets.length;
    saveMeta(this.meta);
  }

  private shopRows(): ShopRow[] {
    return buildShopRows({
      credits: this.credits,
      cargo: this.diveCargo,
      rapid: this.gear.rapid,
      twin: this.gear.twin,
      spread: this.gear.spread,
      pets: this.pets.length,
      maxPets: MAX_PETS,
      maxFuel: this.meta.maxFuel,
      maxEnergy: this.meta.maxEnergy,
      salvageRate: this.meta.salvageRate,
      fuel: this.fuel,
      energy: this.energy,
      tankMax: this.tankMax(),
      energyMax: this.energyMax(),
      engines: this.meta.engines,
      enginesMax: ENGINES_MAX,
      spaceSpeed: Math.round(spaceMaxSpeed(this.meta.engines)),
      nextSpaceSpeed: Math.round(spaceMaxSpeed(this.meta.engines + 1)),
    });
  }

  private spendPurse(cost: number): boolean {
    const purse = this.credits + Math.max(0, this.diveCargo);
    if (purse < cost) return false;
    let left = cost;
    const fromCredits = Math.min(this.meta.credits, left);
    this.meta.credits -= fromCredits;
    left -= fromCredits;
    if (left > 0) this.diveCargo = Math.max(0, this.diveCargo - left);
    this.credits = this.meta.credits;
    saveMeta(this.meta);
    return true;
  }

  private applyShopBuy(id: ShopId): void {
    if (id === "twin") this.gear.twin = true;
    else if (id === "spread") this.gear.spread = true;
    else if (id === "rapid") this.gear.rapid = true;
    else if (id === "pet") this.addPetBody();
    else if (id === "tank") {
      this.meta.maxFuel = Math.min(SHOP_TANK_CAP, this.meta.maxFuel + SHOP_TANK_STEP);
      this.fuel = Math.min(this.tankMax(), this.fuel + SHOP_TANK_STEP);
    } else if (id === "cell") {
      this.meta.maxEnergy = Math.min(SHOP_CELL_CAP, this.meta.maxEnergy + SHOP_CELL_STEP);
      this.energy = Math.min(this.energyMax(), this.energy + SHOP_CELL_STEP);
    } else if (id === "salvage") {
      this.meta.salvageRate = this.meta.salvageRate < 0.75 ? 0.75 : 1;
    } else if (id === "energy") {
      this.energy = this.energyMax();
    }     else if (id === "fuel") {
      this.fuel = this.tankMax();
    } else if (id === "engines") {
      this.meta.engines = Math.min(ENGINES_MAX, this.meta.engines + 1);
    }
    this.persistLoadout();
  }

  private nearStation(): boolean {
    if (this.zone !== "space") return false;
    const reach = STATION.radius + DOCK_RANGE;
    return dist2(this.ship.x, this.ship.y, STATION.x, STATION.y) < reach * reach;
  }

  private closestPoi(): { x: number; y: number; color: string; name: string } {
    const planet = this.closestPlanet();
    const sd = dist2(this.ship.x, this.ship.y, STATION.x, STATION.y);
    const pd = dist2(this.ship.x, this.ship.y, planet.x, planet.y);
    if (sd < pd) return { x: STATION.x, y: STATION.y, color: "#7ee7ff", name: STATION.name };
    return planet;
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
      muzzle: 0,
    };
  }

  private motionOk(): boolean {
    return (
      Number.isFinite(this.ship.x) &&
      Number.isFinite(this.ship.y) &&
      Number.isFinite(this.ship.vx) &&
      Number.isFinite(this.ship.vy) &&
      Number.isFinite(this.camX) &&
      Number.isFinite(this.camY) &&
      Number.isFinite(this.zoom) &&
      this.zoom > 0
    );
  }

  private sanitizeView(): void {
    const ship = this.ship;
    if (!Number.isFinite(ship.x) || !Number.isFinite(ship.y)) {
      if (this.cavern) {
        ship.x = this.cavern.spawnX;
        ship.y = this.cavern.spawnY;
      } else {
        const home = PLANETS[0] as PlanetDef;
        ship.x = home.x + home.radius + SPAWN_CLEARANCE;
        ship.y = home.y;
      }
    }
    if (!Number.isFinite(ship.vx)) ship.vx = 0;
    if (!Number.isFinite(ship.vy)) ship.vy = 0;
    if (!Number.isFinite(ship.angle)) ship.angle = -Math.PI / 2;
    if (!Number.isFinite(this.zoomWanted) || this.zoomWanted < ZOOM_MIN) this.zoomWanted = ZOOM_START;
    if (!Number.isFinite(this.zoom) || this.zoom < ZOOM_MIN) {
      this.zoom = clamp(this.zoomWanted, ZOOM_MIN, ZOOM_MAX);
    }
    this.zoom = clamp(this.zoom, ZOOM_MIN, ZOOM_MAX);
    this.snapCam();
    if (!Number.isFinite(this.camX)) this.camX = 0;
    if (!Number.isFinite(this.camY)) this.camY = 0;
  }

  private unstickShip(): void {
    if (!this.cavern) return;
    const ship = this.ship;
    if (!circleHitsSolid(this.cavern, ship.x, ship.y, SHIP_R + 1)) return;
    const t = this.cavern.tile;
    for (let ring = 1; ring <= 14; ring++) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const x = ship.x + Math.cos(ang) * ring * t;
        const y = ship.y + Math.sin(ang) * ring * t;
        if (!circleHitsSolid(this.cavern, x, y, SHIP_R + 2)) {
          ship.x = x;
          ship.y = y;
          ship.vx = 0;
          ship.vy = 0;
          return;
        }
      }
    }
    ship.x = this.cavern.spawnX;
    ship.y = this.cavern.spawnY;
    ship.vx = 0;
    ship.vy = 0;
  }

  private clearHazardsNearShip(radius: number): void {
    const r2 = radius * radius;
    this.rocks = this.rocks.filter((rock) => dist2(rock.x, rock.y, this.ship.x, this.ship.y) > r2);
  }

  private noteVisit(): void {
    this.noteChartAt(this.ship.x, this.ship.y);
  }

  private noteChartAt(x: number, y: number): void {
    if (!markChart(this.chart, chartIndex(x, y))) return;
    this.meta.visited = chartToString(this.chart);
    saveMeta(this.meta);
  }

  private notePlanet(id: string): void {
    if (!ALL_PLANET_KEYS.includes(id as (typeof ALL_PLANET_KEYS)[number])) return;
    if (this.meta.visitedPlanets.includes(id)) return;
    this.meta.visitedPlanets = [...this.meta.visitedPlanets, id];
    saveMeta(this.meta);
    this.chartPulseArmed.add(id);
  }

  /** Fly-through on the pre-fold segment so a void jump cannot sweep the field. */
  private collectBeacons(x0: number, y0: number): void {
    if (this.zone !== "space") return;
    const x1 = this.ship.x;
    const y1 = this.ship.y;
    for (let i = 0; i < BEACONS.length; i++) {
      if (this.beaconSpent[i]) continue;
      const beacon = BEACONS[i];
      if (!beacon) continue;
      if (!segmentNear(x0, y0, x1, y1, beacon.x, beacon.y, BEACON_COLLECT_R)) continue;
      this.beaconSpent[i] = 1;
      this.payBeacon(beacon);
    }
  }

  private payBeacon(beacon: BeaconDef): void {
    sfxBeacon();
    let label = `+${BEACON_SCRAP} CR`;
    let color = "#ffd36b";
    if (beacon.kind === "scrap") {
      this.meta.credits += BEACON_SCRAP;
      this.credits = this.meta.credits;
      this.runCredits += BEACON_SCRAP;
      saveMeta(this.meta);
    } else {
      const room = this.tankMax() - this.fuel;
      if (room >= 1) {
        const sip = Math.min(BEACON_FUEL, room);
        this.fuel += sip;
        label = `+${Math.round(sip)} FUEL`;
        color = "#7ee7ff";
      } else {
        this.meta.credits += BEACON_SCRAP;
        this.credits = this.meta.credits;
        this.runCredits += BEACON_SCRAP;
        saveMeta(this.meta);
      }
    }
    const accent = beacon.kind === "fuel" ? "#7ee7ff" : "#ff6b3d";
    this.floaters.push({ x: beacon.x, y: beacon.y, text: label, life: 0.95, color });
    this.burst(beacon.x, beacon.y, 4, accent, 90);
    this.pushBeaconPop(beacon.x, beacon.y, accent);
    this.markHud();
  }

  private nearestHole(range: number): HoleDef | null {
    let best: HoleDef | null = null;
    let bestD = range;
    for (const hole of HOLES) {
      const d = Math.hypot(this.ship.x - hole.x, this.ship.y - hole.y);
      if (d < bestD) {
        bestD = d;
        best = hole;
      }
    }
    return best;
  }

  /** Bend velocity into the nearest well. The cruise clamp already ran, so a core pull can exceed it. */
  private pullHole(dt: number): void {
    this.holeLock = Math.max(0, this.holeLock - dt);
    if (this.holeLock > 0) return;
    const hole = this.nearestHole(HOLE_PULL_R);
    if (!hole) return;
    const dx = hole.x - this.ship.x;
    const dy = hole.y - this.ship.y;
    const d = Math.hypot(dx, dy) || 1;
    const t = clamp(1 - d / HOLE_PULL_R, 0, 1);
    const accel = 8000 + t * t * 42000;
    this.ship.vx += (dx / d) * accel * dt;
    this.ship.vy += (dy / d) * accel * dt;
    if (t > 0.15 && Math.random() < 0.65) {
      this.burst(this.ship.x, this.ship.y, 1, Math.random() < 0.5 ? "#ff5ec8" : "#7ee7ff", 90);
    }
  }

  private captureHole(x0: number, y0: number): void {
    if (this.holeLock > 0) return;
    for (const hole of HOLES) {
      if (segmentNear(x0, y0, this.ship.x, this.ship.y, hole.x, hole.y, HOLE_CAPTURE_R)) {
        this.foldHole(hole);
        return;
      }
    }
  }

  private foldHole(from: HoleDef): void {
    let dest: HoleDef | null = null;
    let best = -1;
    for (const hole of HOLES) {
      if (hole.id === from.id) continue;
      const d = dist2(hole.x, hole.y, from.x, from.y);
      if (d > best) {
        best = d;
        dest = hole;
      }
    }
    if (!dest) return;
    const spin = Math.atan2(this.ship.y - from.y, this.ship.x - from.x) + Math.PI / 2;
    const spot = this.clearOfWorld(dest.x + Math.cos(spin) * HOLE_EXIT, dest.y + Math.sin(spin) * HOLE_EXIT);
    this.ship.x = spot.x;
    this.ship.y = spot.y;
    const ox = spot.x - dest.x;
    const oy = spot.y - dest.y;
    const od = Math.hypot(ox, oy) || 1;
    this.ship.vx = (ox / od) * HOLE_EXIT_SPEED;
    this.ship.vy = (oy / od) * HOLE_EXIT_SPEED;
    this.holeLock = HOLE_LOCK;
    this.clearHazardsNearShip(ROCK_CLEAR_R);
    this.snapCam();
    this.burst(spot.x, spot.y, 16, "#ff5ec8", 240);
    this.burst(spot.x, spot.y, 10, "#7ee7ff", 180);
    this.shake = 11;
    this.foldFlash = FOLD_FLASH;
    this.foldPop = FOLD_POP;
    if (HOLES.length > 0) sfxFold();
    this.announce("VOID FOLD");
    this.noteVisit();
  }

  /** Keep a fold exit off planet solids, Hab-7, and the map edge. */
  private clearOfWorld(x: number, y: number): { x: number; y: number } {
    const pads = [
      { x: STATION.x, y: STATION.y, r: STATION.radius + 4000 },
      ...PLANETS.map((planet) => ({ x: planet.x, y: planet.y, r: planet.radius + 4000 })),
    ];
    let px = x;
    let py = y;
    for (let pass = 0; pass < 4; pass++) {
      for (const pad of pads) {
        const dx = px - pad.x;
        const dy = py - pad.y;
        const d = Math.hypot(dx, dy);
        if (d < pad.r) {
          const push = d > 1 ? pad.r / d : pad.r;
          px = pad.x + dx * push;
          py = pad.y + dy * push;
        }
      }
      px = clamp(px, 800, SPACE_W - 800);
      py = clamp(py, 800, SPACE_H - 800);
    }
    return { x: px, y: py };
  }

  private settleShip(): void {
    this.unstickShip();
    this.clearHazardsNearShip(this.zone === "cavern" ? 220 : 280);
    this.wallGrind = false;
    this.snapCam();
  }

  /** Saved Hab-7 level, or Mk 5 for a `?playtest=1` run (not written to the save). */
  private flightEngines(): number {
    const owned = enginesLevel(this.meta.engines);
    return this.runBoost ? ENGINES_MAX : owned;
  }

  private beginWorldCamera(ctx: CanvasRenderingContext2D): void {
    const z = this.zoom;
    this.renderOx = Math.round(this.camX * z) / z;
    this.renderOy = Math.round(this.camY * z) / z;
    ctx.scale(z, z);
  }

  private rx(x: number): number {
    return x - this.renderOx;
  }

  private ry(y: number): number {
    return y - this.renderOy;
  }

  /** Grow a world-space sprite so it stays at least `minScreen` pixels when zoomed out. */
  private markerBoost(span: number, minScreen: number): number {
    const screen = span * this.zoom;
    if (screen >= minScreen) return 1;
    return minScreen / Math.max(screen, 1e-4);
  }

  /** World radius/size that is at least `minScreen` pixels at the current zoom. */
  private worldSpanForScreen(span: number, minScreen: number): number {
    return span * this.markerBoost(span, minScreen);
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
    if (!Number.isFinite(this.zoomWanted)) this.zoomWanted = ZOOM_START;
    this.zoom += (this.zoomWanted - this.zoom) * (1 - Math.exp(-14 * dt));
    this.zoom = clamp(this.zoom, ZOOM_MIN, ZOOM_MAX);
    if (!Number.isFinite(this.zoom) || this.zoom <= 0) this.zoom = ZOOM_MIN;
    const vw = this.w / this.zoom;
    const vh = this.h / this.zoom;
    const ww = this.worldW();
    const wh = this.worldH();
    const tx = vw >= ww ? (ww - vw) / 2 : clamp(this.ship.x - vw / 2, 0, ww - vw);
    const ty = vh >= wh ? (wh - vh) / 2 : clamp(this.ship.y - vh / 2, 0, wh - vh);
    const k = 1 - Math.exp(-8 * dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
  }

  private refreshView(): void {
    this.viewRight = this.camX + this.w / this.zoom;
    this.viewBottom = this.camY + this.h / this.zoom;
  }

  private inView(x: number, y: number, pad: number): boolean {
    return x > this.camX - pad && x < this.viewRight + pad && y > this.camY - pad && y < this.viewBottom + pad;
  }

  private rebuildStars(): void {
    const stars: Star[] = [];
    const dust: Dust[] = [];
    const rand = mulberry(9041);
    const tints = ["#f4f7ff", "#c8e8ff", "#ffe9c4", "#d4fff0", "#ffd0ea"];
    const layers = [
      { n: 240, parallax: 0.00028, s0: 0.6, s1: 1.3, cross: false },
      { n: 150, parallax: 0.00095, s0: 1, s1: 2.1, cross: false },
      { n: 72, parallax: 0.0022, s0: 1.5, s1: 3.1, cross: true },
    ];
    for (const layer of layers) {
      for (let i = 0; i < layer.n; i++) {
        const tint = tints[Math.floor(rand() * tints.length)] ?? "#f4f7ff";
        stars.push({
          x: rand(),
          y: rand(),
          z: 0.18 + rand() * 0.82,
          s: layer.s0 + rand() * (layer.s1 - layer.s0),
          phase: rand() * Math.PI * 2,
          speed: 1.2 + rand() * 5.5,
          tint,
          parallax: layer.parallax * (0.75 + rand() * 0.5),
          cross: layer.cross && rand() > 0.55,
        });
      }
    }
    const dustTints = ["#24304a", "#3a2a38", "#1c3330", "#2a3350"];
    for (let i = 0; i < 200; i++) {
      dust.push({
        x: rand(),
        y: rand(),
        parallax: 0.0032 + rand() * 0.0016,
        tint: dustTints[Math.floor(rand() * dustTints.length)] ?? "#24304a",
      });
    }
    this.stars = stars;
    this.dust = dust;
  }

  private rebuildNebulae(): void {
    const rand = mulberry(77021);
    const palette: [string, string][] = [
      ["rgba(56, 96, 180, 0.32)", "rgba(56, 96, 180, 0)"],
      ["rgba(150, 48, 110, 0.26)", "rgba(150, 48, 110, 0)"],
      ["rgba(36, 120, 110, 0.22)", "rgba(36, 120, 110, 0)"],
      ["rgba(120, 70, 180, 0.2)", "rgba(120, 70, 180, 0)"],
      ["rgba(180, 90, 40, 0.16)", "rgba(180, 90, 40, 0)"],
    ];
    const blobs: Nebula[] = [];
    for (let i = 0; i < 16; i++) {
      const tint = palette[i % palette.length] ?? palette[0];
      blobs.push({
        x: (0.05 + rand() * 0.9) * SPACE_W,
        y: (0.05 + rand() * 0.9) * SPACE_H,
        r: (0.04 + rand() * 0.055) * Math.min(SPACE_W, SPACE_H),
        inner: tint[0],
        outer: tint[1],
      });
    }
    this.nebulae = blobs;
  }

  private decorateMenu(): void {
    this.zone = "space";
    this.planet = null;
    this.cavern = null;
    this.rocks = [];
    this.sparks = [];
    this.hullFlashes = [];
    this.pickups = [];
    this.pets = [];
    const home = PLANETS[0];
    this.ship = this.freshShip(home.x + 5200, home.y - 800);
    this.snapCam();
    for (let i = 0; i < 6; i++) {
      this.spawnRock(1 + (i % 3), {
        x: this.ship.x + (i - 2.5) * 90,
        y: this.ship.y + ((i % 3) - 1) * 70,
        away: false,
      });
    }
  }

  private bindPlaytestHooks(): void {
    if (!this.runBoost || typeof window === "undefined") return;
    const self = this;
    Object.assign(window, {
      reentryWarpStation: () => {
        self.ship.x = STATION.x;
        self.ship.y = STATION.y + STATION.radius + 160;
        self.ship.vx = 0;
        self.ship.vy = 0;
        self.ship.angle = -Math.PI / 2;
        self.snapCam();
      },
      reentryHab: () => {
        self.zone = "space";
        self.cavern = null;
        self.planet = null;
        self.boss = null;
        self.mode = "play";
        const speed = spaceMaxSpeed(self.flightEngines());
        self.ship.x = STATION.x - HAB_RING_R * 0.92;
        self.ship.y = STATION.y;
        self.ship.vx = speed;
        self.ship.vy = 0;
        self.ship.angle = 0;
        self.zoom = SPACE_INTRO_ZOOM;
        self.zoomWanted = SPACE_INTRO_ZOOM;
        self.holeLock = 0;
        self.snapCam();
      },
      reentryWarpReentry: () => {
        const home = PLANETS[0];
        self.ship.x = home.x + home.radius + 80;
        self.ship.y = home.y;
        self.ship.vx = 0;
        self.ship.vy = 0;
        self.snapCam();
      },
      reentryDebug: () => ({
        angle: self.ship.angle,
        thrusting: self.ship.thrusting,
        reversing: self.ship.reversing,
        stickTurn: self.stickTurn,
        stickThrust: self.stickThrust,
        engines: self.flightEngines(),
        spaceSpeed: Math.round(spaceMaxSpeed(self.flightEngines())),
        keys: [...self.keys],
      }),
      reentryPlace: (x: number, y: number) => {
        self.zone = "space";
        self.cavern = null;
        self.boss = null;
        self.ship.x = x;
        self.ship.y = y;
        self.ship.vx = 0;
        self.ship.vy = 0;
        self.ship.angle = 0;
        self.snapCam();
      },
      reentryWarpEdge: () => {
        self.zone = "space";
        self.cavern = null;
        self.boss = null;
        self.ship.x = 200;
        self.ship.y = SPACE_H * 0.5;
        self.ship.vx = spaceMaxSpeed(self.flightEngines());
        self.ship.vy = 0;
        self.ship.angle = 0;
        self.zoom = SPACE_INTRO_ZOOM;
        self.zoomWanted = SPACE_INTRO_ZOOM;
        self.snapCam();
      },
      reentryCruise: () => {
        const speed = spaceMaxSpeed(self.flightEngines());
        return {
          speed,
          longAxis: SPACE_W,
          seconds: SPACE_W / speed,
          engines: self.flightEngines(),
          x: self.ship.x,
          y: self.ship.y,
        };
      },
      reentryChart: () => {
        let cells = 0;
        for (let i = 0; i < CHART_CELLS; i++) {
          if (self.chart[i >> 3]! & (1 << (i & 7))) cells += 1;
        }
        return { cells, planets: self.meta.visitedPlanets.slice() };
      },
      reentryHoles: () => HOLES.map((hole) => ({ id: hole.id, x: hole.x, y: hole.y })),
      reentryBeacons: () =>
        BEACONS.map((beacon) => ({
          id: beacon.id,
          x: Math.round(beacon.x),
          y: Math.round(beacon.y),
          kind: beacon.kind,
          spent: self.beaconSpent[beacon.id] === 1,
        })),
      reentryBeacon: (id = 0) => {
        const beacon = BEACONS[id] ?? BEACONS[0];
        if (!beacon) return;
        self.zone = "space";
        self.cavern = null;
        self.planet = null;
        self.boss = null;
        self.mode = "play";
        const speed = spaceMaxSpeed(self.flightEngines());
        const approach = BEACON_RING_R * 0.92;
        let x = beacon.x - approach;
        let angle = 0;
        let vx = speed;
        if (x < 4000) {
          x = beacon.x + approach;
          angle = Math.PI;
          vx = -speed;
        }
        self.ship.x = x;
        self.ship.y = beacon.y;
        self.ship.vx = vx;
        self.ship.vy = 0;
        self.ship.angle = angle;
        self.zoom = SPACE_INTRO_ZOOM;
        self.zoomWanted = SPACE_INTRO_ZOOM;
        self.holeLock = 0;
        self.snapCam();
      },
      reentryFold: (id = 0) => {
        const hole = HOLES[id] ?? HOLES[0];
        if (!hole) return;
        self.zone = "space";
        self.cavern = null;
        self.planet = null;
        self.boss = null;
        self.mode = "play";
        self.ship.x = hole.x + HOLE_PULL_R * 0.42;
        self.ship.y = hole.y;
        self.ship.vx = -1800;
        self.ship.vy = 0;
        self.ship.angle = Math.PI;
        self.holeLock = 0;
        self.zoom = SPACE_INTRO_ZOOM;
        self.zoomWanted = SPACE_INTRO_ZOOM;
        self.snapCam();
      },
      reentryAudio: () => audioSnapshot(),
      reentryFuel: (ratio = 1) => {
        if (self.zone !== "cavern" || !self.cavern) {
          const home = PLANETS[0];
          if (!home) return;
          self.mode = "play";
          self.enterPlanet(home);
        }
        const max = self.tankMax();
        self.fuel = clamp(Number(ratio) || 0, 0, 1) * max;
        self.markHud();
        return { fuel: self.fuel, max, band: fuelBand(self.fuel, max) };
      },
    });
  }

  /** One mute-aware blip when a dive crosses under 20%. Stays quiet until fuel recovers. */
  private noteFuelWarn(): void {
    if (this.zone !== "cavern") {
      this.fuelWarnLatched = false;
      return;
    }
    if (fuelBand(this.fuel, this.tankMax()) === "ok") {
      this.fuelWarnLatched = false;
      return;
    }
    if (this.fuelWarnLatched) return;
    this.fuelWarnLatched = true;
    sfxFuelLow();
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
      if (this.nearStation()) next = "Dock station — E";
      else if (this.transitLock > 0) next = "";
      else {
        const planet = this.nearestPlanet(REENTRY_RANGE);
        if (planet) {
          if (this.isUnlocked(planet.id)) next = `Re-enter ${planet.name}  —  E`;
          else {
            const need = neededKey(planet.id);
            next = need ? lockPrompt(planet.name, need) : `Re-enter ${planet.name}  —  E`;
          }
        } else if (this.holeLock <= 0 && this.nearestHole(HOLE_PULL_R)) {
          next = "Void fold";
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

  private transitReady(): boolean {
    if (this.zone === "space") {
      if (this.nearStation()) return true;
      if (this.transitLock > 0) return false;
      return this.nearestPlanet(REENTRY_RANGE) != null;
    }
    return Boolean(this.cavern && inExitShaft(this.cavern, this.ship.x, this.ship.y));
  }

  /** Fire E/Enter when the halo appears, even if the key was already held. */
  private updateInteract(): void {
    if (this.mode !== "play") return;
    if (!this.held("KeyE", "Enter")) {
      this.interactLatch = false;
      return;
    }
    if (this.interactLatch || !this.transitReady()) return;
    this.interactLatch = true;
    this.tryTransit();
  }

  private tryTransit(): void {
    if (this.mode !== "play") return;
    if (this.transitReady()) this.interactLatch = true;
    if (this.zone === "space") {
      if (this.nearStation()) {
        this.openShop();
        return;
      }
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
    if (this.mode !== "play" || this.transitLock > 0) return;
    if (!this.isUnlocked(planet.id)) {
      const need = neededKey(planet.id);
      this.announce(need ? lockPrompt(planet.name, need) : `${planet.name.toUpperCase()} LOCKED`);
      return;
    }
    this.pendingPlanet = planet;
    this.cineKind = "splash";
    this.cine = new PlanetSplash(planet);
    this.mode = "cine";
    this.reentrySpaceGrace = REENTRY_SPACE_GRACE;
    this.keys.delete("Space");
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
    if (kind === "splash" && planet) {
      this.cineKind = "reentry";
      this.cine = new ReentryCine(planet);
      this.mode = "cine";
      this.reentrySpaceGrace = REENTRY_SPACE_GRACE;
      this.keys.delete("Space");
      this.markHud();
      return;
    }
    this.cine = null;
    this.cineKind = null;
    this.reentrySpaceGrace = 0;
    this.pendingPlanet = null;
    this.mode = "play";
    this.keys.delete("KeyE");
    this.keys.delete("Enter");
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
    this.zoom = 1;
    this.zoomWanted = 1;
    this.rocks = [];
    this.pickups = [];
    this.bullets = [];
    this.sparks = [];
    this.hullFlashes = [];
    this.floaters = [];
    this.diveCargo = 0;
    this.fuel = this.tankMax();
    this.fuelWarnLatched = false;
    this.ship = this.freshShip(cavern.spawnX, cavern.spawnY);
    this.settleShip();
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
    this.notePlanet(planet.id);
    this.noteChartAt(planet.x, planet.y);
    this.diveFlash = DIVE_FLASH;
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
    this.diveFlash = 0;
    this.boss = null;
    this.zoom = SPACE_INTRO_ZOOM;
    this.zoomWanted = SPACE_INTRO_ZOOM;
    if (hold) {
      this.rocks = hold.rocks;
      this.pickups = hold.pickups;
      this.bullets = [];
      this.sparks = [];
      this.hullFlashes = [];
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
      const lift = planet.radius + SPAWN_CLEARANCE;
      x = clamp(planet.x + Math.cos(ang) * lift, 80, SPACE_W - 80);
      y = clamp(planet.y + Math.sin(ang) * lift, 80, SPACE_H - 80);
    } else if (hold) {
      x = hold.x;
      y = hold.y;
    }
    this.ship = this.freshShip(x, y);
    this.transitLock = Math.max(this.transitLock, TRANSIT_LOCK);
    this.settleShip();
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
      if (dist2(spot.x, spot.y, cavern.spawnX, cavern.spawnY) < 240 * 240) continue;
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
    this.seedCinderShaftFuel(planet, cavern);
  }

  /** Guaranteed cans on the Cinder shaft until Ember Warden drops the key. */
  private seedCinderShaftFuel(planet: PlanetDef, cavern: Cavern): void {
    if (planet.id !== "cinder" || this.meta.keys.includes("cinder")) return;
    const trail = bossApproach(planet);
    if (trail.length < 8) return;
    for (const frac of CINDER_SHAFT_AT) {
      const cell = trail[Math.round((trail.length - 1) * frac)];
      if (!cell) continue;
      const x = (cell.c + 0.5) * cavern.tile;
      const y = (cell.r + 0.5) * cavern.tile;
      if (this.nearBoss(x, y, cavern, 160)) continue;
      this.pickups.push({
        x,
        y,
        vx: 0,
        vy: 0,
        kind: "fuel",
        life: 240,
        value: CINDER_SHAFT_FUEL,
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
    this.fuel = Math.max(this.fuel, Math.min(RESCUE_FUEL, this.tankMax()));
    this.transitLock = TRANSIT_LOCK;
    this.exitPlanet(null, `RESCUE +${banked} CR  (−${fee} fee)`);
  }

  private spawnWave(wave: number): void {
    const n = 5 + wave * 2;
    const close = wave <= 1;
    for (let i = 0; i < n; i++) {
      this.spawnRock(3, {
        away: true,
        close,
        angle: close ? (i / n) * Math.PI * 2 : undefined,
      });
    }
    this.capRocks();
  }

  /**
   * First-wave ring inside the current view. The far ring (1800–4200) sits
   * off-screen at the opening zoom, so Begin used to look empty.
   */
  private openingBand(radius: number): { min: number; max: number } {
    const half = Math.min(this.viewW(), this.viewH()) * 0.5;
    const hull = SHIP_R + radius + 36;
    const edge = Math.max(hull, half - radius - 20);
    const comfort = hull + 70;
    const min = Math.min(comfort, Math.max(hull, edge * 0.5));
    const max = Math.min(edge, Math.max(min + 28, Math.min(edge * 0.9, comfort + 180)));
    return { min, max: Math.max(min, max) };
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
    opts: {
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      away?: boolean;
      close?: boolean;
      angle?: number;
    },
  ): void {
    const rand = mulberry(++this.seed);
    const radius = rockRadius(size);
    const ww = this.worldW();
    const wh = this.worldH();
    let x = opts.x ?? radius + rand() * (ww - radius * 2);
    let y = opts.y ?? radius + rand() * (wh - radius * 2);
    const close = opts.away === true && opts.close === true;
    if (opts.away) {
      let placed = false;
      const clearR = close ? SHIP_R + radius + 16 : ROCK_CLEAR_R;
      const clear2 = clearR * clearR;
      // Later waves scale with the view and cruise so a fast ship still has a
      // couple of seconds before contact. The opening wave stays in-frame.
      const view = Math.max(this.viewW(), this.viewH());
      const cruise = this.zone === "cavern" ? MAX_SPEED_CAVE : spaceMaxSpeed(this.flightEngines());
      const reach = Math.max(ROCK_CLEAR_R, Math.min(view * 0.72, cruise * 2.2));
      const band = close ? this.openingBand(radius) : null;
      for (let attempt = 0; attempt < 16; attempt++) {
        const ang = opts.angle != null ? opts.angle + (rand() - 0.5) * 0.5 : rand() * Math.PI * 2;
        const dist = band ? band.min + rand() * (band.max - band.min) : reach + rand() * reach * 0.9;
        x = this.ship.x + Math.cos(ang) * dist;
        y = this.ship.y + Math.sin(ang) * dist;
        x = clamp(x, radius + 40, ww - radius - 40);
        y = clamp(y, radius + 40, wh - radius - 40);
        if (dist2(x, y, this.ship.x, this.ship.y) >= clear2) {
          placed = true;
          break;
        }
      }
      if (!placed) return;
    } else if (
      opts.x != null &&
      opts.y != null &&
      this.zone === "space" &&
      dist2(x, y, this.ship.x, this.ship.y) < 90 * 90
    ) {
      return;
    }
    if (this.cavern && circleHitsSolid(this.cavern, x, y, radius)) return;
    const speed = close
      ? 26 + rand() * 40
      : (22 + rand() * 34 + (4 - size) * 16) * (0.85 + this.wave * 0.04);
    const heading = close
      ? Math.atan2(this.ship.y - y, this.ship.x - x) + (rand() - 0.5) * 1.4
      : rand() * Math.PI * 2;
    this.rocks.push({
      x,
      y,
      vx: opts.vx ?? Math.cos(heading) * speed,
      vy: opts.vy ?? Math.sin(heading) * speed,
      radius,
      size,
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 1.2,
      ...(this.zone === "space"
        ? rockSilhouette(this.seed)
        : {
            verts: makeVerts(this.seed),
            stroke: ROCK_STROKES[Math.floor(rand() * ROCK_STROKES.length)] ?? "#7ee7ff",
          }),
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
    ship.muzzle = Math.max(0, ship.muzzle - dt);
    this.shieldPulse = Math.max(0, this.shieldPulse - dt);

    const keyLeft = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    const keyRight = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const keyForward = this.keys.has("ArrowUp") || this.keys.has("KeyW");
    const keyBack = this.keys.has("ArrowDown") || this.keys.has("KeyS");
    const wantShield = this.held("ShiftLeft", "ShiftRight");

    // Keyboard stays digital and wins over the stick. W still beats S.
    // The stick is already deadzoned and diagonally normalized.
    let turn = keyLeft || keyRight ? (keyRight ? 1 : 0) - (keyLeft ? 1 : 0) : this.stickTurn;
    let thrust = keyForward || keyBack ? (keyForward ? 1 : -1) : this.stickThrust;
    turn = clamp(turn, -1, 1);
    thrust = clamp(thrust, -1, 1);

    if (turn !== 0) ship.angle += TURN * turn * dt;
    const canThrust = this.zone === "space" || this.fuel > 0;
    ship.thrusting = canThrust && thrust > 0.02;
    ship.reversing = canThrust && thrust < -0.02;

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
      const base = this.zone === "space" ? spaceThrust(this.flightEngines()) : THRUST;
      const power = (ship.reversing ? base * 0.7 : base) * Math.abs(thrust);
      ship.vx += Math.cos(ship.angle) * power * dir * dt;
      ship.vy += Math.sin(ship.angle) * power * dir * dt;
      if (this.zone === "cavern") {
        this.fuel = Math.max(0, this.fuel - FUEL_THRUST * dt * Math.abs(thrust));
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
        this.thrustSfx = 0.12;
      }
    } else if (this.zone === "cavern") {
      this.fuel = Math.max(0, this.fuel - FUEL_IDLE * dt);
    }

    const maxSpeed = this.zone === "cavern" ? MAX_SPEED_CAVE : spaceMaxSpeed(this.flightEngines());
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > maxSpeed) {
      ship.vx = (ship.vx / speed) * maxSpeed;
      ship.vy = (ship.vy / speed) * maxSpeed;
    }
    const drag = this.zone === "cavern" ? CAVE_DRAG : SPACE_DRAG;
    ship.vx *= Math.max(0, 1 - drag * dt);
    ship.vy *= Math.max(0, 1 - drag * dt);

    if (this.cavern) {
      const preVx = ship.vx;
      const preVy = ship.vy;
      const step = Math.max(dt, 1 / 240);
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
        ship.vx = moved.vx / step;
        ship.vy = moved.vy / step;
        if (!Number.isFinite(ship.vx)) ship.vx = 0;
        if (!Number.isFinite(ship.vy)) ship.vy = 0;
        const impact = Math.hypot(preVx, preVy);
        const fresh = !this.wallGrind;
        this.wallGrind = true;
        if (fresh && impact > WALL_SLAM && ship.invuln <= 0) this.crashHit();
      } else {
        this.wallGrind = false;
      }
    } else {
      const x0 = ship.x;
      const y0 = ship.y;
      this.pullHole(dt);
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
      this.collectBeacons(x0, y0);
      this.captureHole(x0, y0);
      this.noteVisit();
    }

    // Hold Space, J/K, or the Fire pad. Rapid feeder owns the short cooldown.
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
      this.shieldPulse = SHIELD_PULSE;
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
    const neon = this.gunsOwned();
    if (neon) ship.muzzle = MUZZLE_FLASH;
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
        vx: Math.cos(a) * BULLET_SPEED + ship.vx,
        vy: Math.sin(a) * BULLET_SPEED + ship.vy,
        life: BULLET_LIFE,
        team: "ship",
        neon,
      });
    }
    sfxShoot();
  }

  private gunsOwned(): boolean {
    return this.gear.twin || this.gear.spread || this.gear.rapid;
  }

  /** Energy cell is the Hull shield upgrade. Stock max stays a bare hull. */
  private hullShieldOwned(): boolean {
    return this.meta.maxEnergy > START_MAX_ENERGY;
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
      if (this.cavern) {
        pet.vx += (tx - pet.x) * 7 * dt;
        pet.vy += (ty - pet.y) * 7 * dt;
        pet.vx *= Math.max(0, 1 - 4.2 * dt);
        pet.vy *= Math.max(0, 1 - 4.2 * dt);
      } else {
        // Match cruise velocity or the drone is left screens behind at full engines.
        const dx = tx - pet.x;
        const dy = ty - pet.y;
        pet.vx = ship.vx + clamp(dx * 5, -800, 800);
        pet.vy = ship.vy + clamp(dy * 5, -800, 800);
      }
      if (this.cavern) {
        const moved = moveAgainst(this.cavern, pet.x, pet.y, pet.vx * dt, pet.vy * dt, PET_R, 0.2);
        pet.x = moved.x;
        pet.y = moved.y;
        pet.vx = moved.hit ? moved.vx / Math.max(dt, 1 / 240) : pet.vx;
        pet.vy = moved.hit ? moved.vy / Math.max(dt, 1 / 240) : pet.vy;
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
            vx: Math.cos(pet.angle) * 520 + pet.vx,
            vy: Math.sin(pet.angle) * 520 + pet.vy,
            life: 0.85,
            team: "pet",
            neon: false,
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
    const list = this.bullets;
    const ww = this.worldW();
    const wh = this.worldH();
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < 0 || b.x > ww || b.y < 0 || b.y > wh) continue;
      if (this.cavern && circleHitsSolid(this.cavern, b.x, b.y, 2)) continue;
      list[w++] = b;
    }
    list.length = w;
  }

  private stepRocks(dt: number): void {
    for (const rock of this.rocks) {
      if (this.cavern) {
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
        rock.vx = moved.hit ? moved.vx / Math.max(dt, 1 / 240) : rock.vx;
        rock.vy = moved.hit ? moved.vy / Math.max(dt, 1 / 240) : rock.vy;
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
    const list = this.pickups;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p) continue;
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
      if (p.life > 0) list[w++] = p;
    }
    list.length = w;
  }

  private stepSparks(dt: number): void {
    const list = this.sparks;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s) continue;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.97;
      s.vy *= 0.97;
      if (s.life > 0) list[w++] = s;
    }
    if (w > MAX_SPARKS) {
      const drop = w - MAX_SPARKS;
      for (let i = 0; i < MAX_SPARKS; i++) list[i] = list[i + drop]!;
      w = MAX_SPARKS;
    }
    list.length = w;
  }

  private stepFloaters(dt: number): void {
    const list = this.floaters;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (!f) continue;
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life > 0) list[w++] = f;
    }
    list.length = w;
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
      this.persistLoadout();
      label = "RAPID";
      color = "#ff7ad9";
    } else if (p.kind === "twin") {
      this.gear.twin = true;
      this.persistLoadout();
      label = "TWIN";
      color = "#9ad8ff";
    } else if (p.kind === "spread") {
      this.gear.spread = true;
      this.persistLoadout();
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

  private addPetBody(): boolean {
    if (this.pets.length >= MAX_PETS) return false;
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

  private spawnPet(): boolean {
    if (!this.addPetBody()) {
      if (this.zone === "cavern") this.diveCargo += 25;
      else {
        this.runCredits += 25;
        this.meta.credits += 25;
        this.credits = this.meta.credits;
        saveMeta(this.meta);
      }
      return false;
    }
    this.persistLoadout();
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
    const deathAt = this.screenOf(ship.x, ship.y);
    this.burst(ship.x, ship.y, 18, "#7ee7ff", 150);
    this.burst(ship.x, ship.y, 10, "#ff6b8a", 110);
    this.pushHullFlash("death", deathAt.sx, deathAt.sy);
    this.shake = 12;
    sfxHit();
    sfxThud();
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
    this.settleShip();
    const backAt = this.screenOf(this.ship.x, this.ship.y);
    this.pushHullFlash("back", backAt.sx, backAt.sy);
    sfxBack();
    this.announce("HULL BREACH");
  }

  /** CSS pixels. Captured before the camera snaps so the shatter stays on the breach. */
  private screenOf(x: number, y: number): { sx: number; sy: number } {
    return {
      sx: (x - this.camX) * this.zoom,
      sy: (y - this.camY) * this.zoom,
    };
  }

  private pushHullFlash(kind: "death" | "back", sx: number, sy: number): void {
    if (this.hullFlashes.length > 6) this.hullFlashes.shift();
    const max = kind === "death" ? HULL_FLASH : HULL_POP;
    this.hullFlashes.push({
      sx,
      sy,
      life: max,
      max,
      delay: kind === "back" ? 0.06 : 0,
      kind,
    });
  }

  private stepHullFlashes(dt: number): void {
    const list = this.hullFlashes;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const flash = list[i];
      if (!flash) continue;
      if (flash.delay > 0) {
        flash.delay = Math.max(0, flash.delay - dt);
        list[w++] = flash;
        continue;
      }
      flash.life -= dt;
      if (flash.life > 0) list[w++] = flash;
    }
    list.length = w;
  }

  private checkWave(): void {
    if (this.mode !== "play" || this.zone !== "space") return;
    if (this.rocks.length > 0) return;
    this.wave += 1;
    this.ship.invuln = Math.max(this.ship.invuln, 2);
    this.spawnWave(this.wave);
    this.clearHazardsNearShip(this.wave <= 1 ? 70 : ROCK_CLEAR_R);
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
    const driftX = ((this.camX * 0.00022) % w + w) % w;
    const driftY = ((this.camY * 0.00018) % h + h) % h;
    const key = `${w}x${h}:${Math.round(driftX / 48)}:${Math.round(driftY / 48)}`;
    if (this.nebulaKey !== key || !this.nebulaCool || !this.nebulaWarm) {
      const cx = (w * 0.28 - driftX + w) % w;
      const cy = (h * 0.22 - driftY + h) % h;
      const cool = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.85);
      cool.addColorStop(0, "rgba(48, 72, 128, 0.38)");
      cool.addColorStop(1, "rgba(0, 0, 0, 0)");
      const wx = (w * 0.78 - driftX * 0.6 + w) % w;
      const wy = (h * 0.7 - driftY * 0.6 + h) % h;
      const warm = ctx.createRadialGradient(wx, wy, 0, wx, wy, w * 0.7);
      warm.addColorStop(0, "rgba(90, 32, 70, 0.28)");
      warm.addColorStop(1, "rgba(0, 0, 0, 0)");
      this.nebulaCool = cool;
      this.nebulaWarm = warm;
      this.nebulaKey = key;
    }
    ctx.fillStyle = this.nebulaCool;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.nebulaWarm;
    ctx.fillRect(0, 0, w, h);
    this.drawNebulae(ctx);
    this.drawStars(ctx);
  }

  private drawNebulae(ctx: CanvasRenderingContext2D): void {
    const z = this.zoom;
    const w = this.w;
    const h = this.h;
    const limit = Math.hypot(w, h) * 2.4;
    for (const blob of this.nebulae) {
      const sx = (blob.x - this.camX) * z;
      const sy = (blob.y - this.camY) * z;
      const sr = blob.r * z;
      if (sr < 8) continue;
      if (sx + sr < -20 || sy + sr < -20 || sx - sr > w + 20 || sy - sr > h + 20) continue;
      if (sr > limit) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = blob.inner;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        continue;
      }
      const g = ctx.createRadialGradient(sx, sy, Math.max(1, sr * 0.05), sx, sy, sr);
      g.addColorStop(0, blob.inner);
      g.addColorStop(1, blob.outer);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D): void {
    const t = performance.now() * 0.001;
    const camX = this.camX;
    const camY = this.camY;
    const sw = this.w;
    const sh = this.h;
    ctx.globalAlpha = 0.45;
    for (const mote of this.dust) {
      const x = ((mote.x * sw - camX * mote.parallax) % sw + sw) % sw;
      const y = ((mote.y * sh - camY * mote.parallax) % sh + sh) % sh;
      ctx.fillStyle = mote.tint;
      ctx.fillRect(x, y, 2, 2);
    }
    for (const star of this.stars) {
      const x = ((star.x * sw - camX * star.parallax) % sw + sw) % sw;
      const y = ((star.y * sh - camY * star.parallax) % sh + sh) % sh;
      let u = t * star.speed + star.phase;
      u = u * 0.159154943 - Math.floor(u * 0.159154943);
      const wave = u < 0.5 ? u * 2 : 2 - u * 2;
      const blink = wave * wave;
      const alpha = (0.14 + star.z * 0.6) * (0.25 + 1.05 * blink);
      ctx.globalAlpha = clamp(alpha, 0.05, 1);
      ctx.fillStyle = star.tint;
      const size = star.s * (0.7 + blink * 0.85);
      ctx.fillRect(x, y, size, size);
      if (star.cross) {
        ctx.globalAlpha = clamp(alpha * 0.7, 0.05, 0.8);
        ctx.fillRect(x - size, y + size * 0.35, size * 3, Math.max(1, size * 0.3));
        ctx.fillRect(x + size * 0.35, y - size, Math.max(1, size * 0.3), size * 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPlanets(ctx: CanvasRenderingContext2D): void {
    for (const planet of PLANETS) {
      const drawR = this.worldSpanForScreen(planet.radius, 7);
      if (!this.inView(planet.x, planet.y, drawR + 80)) continue;
      const unlocked = this.isUnlocked(planet.id);
      const x = this.rx(planet.x);
      const y = this.ry(planet.y);
      ctx.save();
      ctx.globalAlpha = unlocked ? 1 : 0.48;
      ctx.beginPath();
      ctx.arc(x, y, drawR + Math.max(26, 8 / this.zoom), 0, Math.PI * 2);
      ctx.fillStyle = planet.atmosphere;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = planet.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - drawR * 0.28, y - drawR * 0.28, drawR * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fill();
      if (planet.radius * this.zoom < 12) {
        ctx.globalAlpha = unlocked ? 0.9 : 0.55;
        ctx.strokeStyle = planet.color;
        ctx.lineWidth = Math.max(1.2, 2 / this.zoom);
        const arm = drawR + 5 / this.zoom;
        ctx.beginPath();
        ctx.moveTo(x - arm, y);
        ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm);
        ctx.lineTo(x, y + arm);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawStation(ctx: CanvasRenderingContext2D): void {
    const boost = this.markerBoost(STATION.radius * 2, 16);
    const showCore = this.inView(STATION.x, STATION.y, STATION.radius * boost + 80);
    const showRing = this.zoom < 0.08 && this.inView(STATION.x, STATION.y, HAB_RING_R);
    if (!showCore && !showRing) return;
    const x = this.rx(STATION.x);
    const y = this.ry(STATION.y);
    if (showRing) this.drawHabApproach(ctx, x, y);
    if (!showCore) return;
    const t = performance.now() * 0.001;
    const breathe = 0.55 + 0.45 * Math.sin(t * 2.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(boost, boost);
    ctx.strokeStyle = "#7ee7ff";
    ctx.globalAlpha = 0.22 + breathe * 0.28;
    ctx.lineWidth = Math.max(1.6, 3.2 / this.zoom) / boost;
    ctx.beginPath();
    ctx.arc(0, 0, STATION.radius + 12 + breathe * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, STATION.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(t * 0.35);
    ctx.strokeStyle = "#ff7ad9";
    ctx.lineWidth = Math.max(1.2, 2.4 / this.zoom) / boost;
    ctx.strokeRect(-STATION.radius * 0.38, -STATION.radius * 0.22, STATION.radius * 0.76, STATION.radius * 0.44);
    ctx.beginPath();
    ctx.moveTo(-STATION.radius * 0.92, 0);
    ctx.lineTo(-STATION.radius * 0.38, 0);
    ctx.moveTo(STATION.radius * 0.38, 0);
    ctx.lineTo(STATION.radius * 0.92, 0);
    ctx.stroke();
    ctx.fillStyle = "#0b1218";
    ctx.beginPath();
    ctx.arc(0, 0, STATION.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffe08a";
    ctx.stroke();
    ctx.restore();
  }

  /** Faint cyan arcs at cruise scale. Shop-header ink (`#7ee7ff`), no new landmark. */
  private drawHabApproach(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const now = performance.now();
    const spin = now * 0.00032;
    const pulse = 0.55 + 0.45 * Math.sin(now * 0.0034);
    const d = Math.hypot(this.ship.x - STATION.x, this.ship.y - STATION.y);
    const near = clamp(1 - d / (HAB_RING_R * 1.35), 0, 1);
    const alpha = 0.14 + near * 0.3;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#7ee7ff";
    ctx.lineWidth = Math.max(1.15, 1.7 / this.zoom);
    ctx.globalAlpha = alpha * 0.42;
    ctx.beginPath();
    ctx.arc(x, y, HAB_RING_R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * pulse;
    ctx.beginPath();
    ctx.arc(x, y, HAB_RING_R, spin, spin + 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, HAB_RING_R, spin + Math.PI, spin + Math.PI + 1.2);
    ctx.stroke();
    const inner = HAB_RING_R * (0.62 + pulse * 0.03);
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, inner, -spin * 1.25, -spin * 1.25 + 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, inner, -spin * 1.25 + Math.PI, -spin * 1.25 + Math.PI + 0.95);
    ctx.stroke();
    ctx.restore();
  }

  private drawRock(ctx: CanvasRenderingContext2D, rock: Rock): void {
    ctx.save();
    ctx.translate(this.rx(rock.x), this.ry(rock.y));
    ctx.rotate(rock.rot);
    const boost = this.markerBoost(rock.radius * 2, 8);
    ctx.scale(boost, boost);
    ctx.beginPath();
    const verts = rock.verts;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const v = verts[i] ?? 1;
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * rock.radius * v;
      const y = Math.sin(a) * rock.radius * v;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = this.cavern ? "#0a0c10" : "#000108";
    ctx.fill();
    if (!this.cavern) ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.15, 2.15 / this.zoom) / boost;
    ctx.strokeStyle = rock.stroke;
    ctx.stroke();
    ctx.restore();
  }

  private drawBullet(ctx: CanvasRenderingContext2D, b: Bullet): void {
    const x = this.rx(b.x);
    const y = this.ry(b.y);
    if (b.neon) {
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const len = this.worldSpanForScreen(14, 8);
      const dx = (b.vx / speed) * len;
      const dy = (b.vy / speed) * len;
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(126, 231, 255, 0.72)";
      ctx.lineWidth = this.worldSpanForScreen(1.35, 1.15);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - dx * 0.28, y - dy * 0.28);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#ffc14d";
      ctx.lineWidth = this.worldSpanForScreen(1.05, 1);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    ctx.fillStyle = b.team === "pet" ? "#7dffb1" : b.neon ? "#7ee7ff" : "#e8ffff";
    ctx.beginPath();
    const br = this.worldSpanForScreen(b.team === "pet" ? 2 : 2.4, 2);
    ctx.arc(x, y, br, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPickup(ctx: CanvasRenderingContext2D, p: Pickup): void {
    const look = PICKUP_LOOK[p.kind];
    const pulse = 9 + Math.sin(performance.now() / 180) * 2;
    ctx.save();
    ctx.translate(this.rx(p.x), this.ry(p.y));
    const boost = this.markerBoost(18, 8);
    ctx.scale(boost, boost);
    ctx.strokeStyle = look.color;
    ctx.lineWidth = 2 / boost;
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
    ctx.font = `700 ${9 / (boost * this.zoom)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(look.mark, 0, 1);
    ctx.restore();
  }

  private drawSpark(ctx: CanvasRenderingContext2D, s: Spark): void {
    const a = clamp(s.life / s.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = s.color;
    const size = this.worldSpanForScreen(s.size, 1.6);
    ctx.fillRect(this.rx(s.x), this.ry(s.y), size, size);
    ctx.globalAlpha = 1;
  }

  private drawPet(ctx: CanvasRenderingContext2D, pet: Pet): void {
    ctx.save();
    ctx.translate(this.rx(pet.x), this.ry(pet.y));
    ctx.rotate(pet.angle);
    const boost = this.markerBoost(20, 10);
    ctx.scale(boost, boost);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(125, 255, 177, 0.16)";
    ctx.fill();
    ctx.lineWidth = 1.35 / boost;
    ctx.strokeStyle = "rgba(126, 231, 255, 0.42)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, -6);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 4.5 / boost;
    ctx.strokeStyle = "rgba(125, 255, 177, 0.4)";
    ctx.stroke();
    ctx.fillStyle = "#07140e";
    ctx.fill();
    ctx.lineWidth = 2 / boost;
    ctx.strokeStyle = "#7dffb1";
    ctx.stroke();
    ctx.restore();
  }

  private drawShieldBubble(ctx: CanvasRenderingContext2D, boost: number): void {
    const up = this.ship.shielding;
    const pulse = this.shieldPulse > 0 ? this.shieldPulse / SHIELD_PULSE : 0;
    if (!up && !this.hullShieldOwned() && pulse <= 0) return;
    const breathe = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
    const base = up ? 0.3 + breathe * 0.08 : 0.16 + breathe * 0.06;
    const strokeA = Math.min(0.72, base + pulse * 0.38);
    const radius = 20 + (up ? 1.5 : 0) + pulse * 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(126, 231, 255, ${(strokeA * 0.28).toFixed(3)})`;
    ctx.fill();
    ctx.lineWidth = (1.25 + pulse * 0.8) / boost;
    ctx.strokeStyle = `rgba(126, 231, 255, ${strokeA.toFixed(3)})`;
    ctx.stroke();
  }

  private drawMuzzle(ctx: CanvasRenderingContext2D, boost: number): void {
    const life = this.ship.muzzle;
    if (life <= 0 || !this.gunsOwned()) return;
    const t = clamp(life / MUZZLE_FLASH, 0, 1);
    ctx.globalAlpha = 0.4 + 0.6 * t;
    ctx.lineCap = "round";
    for (const shot of this.shipShots()) {
      const len = 7 + 8 * t;
      const x0 = 15;
      const y0 = shot.lateral;
      const x1 = x0 + Math.cos(shot.angle) * len;
      const y1 = y0 + Math.sin(shot.angle) * len;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = "#7ee7ff";
      ctx.lineWidth = 1.5 / boost;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(shot.angle) * len * 0.38, y0 + Math.sin(shot.angle) * len * 0.38);
      ctx.strokeStyle = "#ffc14d";
      ctx.lineWidth = 2.2 / boost;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
  }

  private drawShip(ctx: CanvasRenderingContext2D): void {
    const ship = this.ship;
    const blink = ship.invuln > 0 && Math.floor(ship.invuln * 12) % 2 === 0;
    ctx.save();
    ctx.translate(this.rx(ship.x), this.ry(ship.y));
    ctx.rotate(ship.angle);
    const boost = this.markerBoost(32, 12);
    ctx.scale(boost, boost);
    this.drawShieldBubble(ctx, boost);
    if (blink) {
      ctx.restore();
      return;
    }
    this.drawMuzzle(ctx, boost);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, 9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, -9);
    ctx.closePath();
    ctx.fillStyle = "#0b1218";
    ctx.fill();
    ctx.lineWidth = Math.max(2, 2 / this.zoom) / boost;
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
    const sx = this.rx(f.x) * this.zoom;
    const sy = this.ry(f.y) * this.zoom;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = clamp(f.life * 1.6, 0, 1);
    ctx.fillStyle = f.color;
    ctx.font = "700 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, sx, sy);
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
    if (this.zone === "cavern") {
      const mark = this.bossTelegraph();
      if (mark) this.drawEdgeMarker(ctx, mark.x, mark.y, mark.color, mark.name, true);
      return;
    }
    if (this.zone !== "space") return;
    const poi = this.closestPoi();
    const sx = (poi.x - this.camX) * this.zoom;
    const sy = (poi.y - this.camY) * this.zoom;
    const pad = 56;
    const onScreen =
      sx > pad && sx < this.w - pad && sy > pad && sy < this.h - pad - 140;
    const dx = poi.x - this.ship.x;
    const dy = poi.y - this.ship.y;
    const dist = Math.hypot(dx, dy);
    if (onScreen) {
      // Name / LOCKED are drawSpaceLabels. Re-entry is the HTML #prompt.
      // Keep the off-screen arrow + distance only.
      return;
    }
    this.drawEdgeMarker(ctx, poi.x, poi.y, poi.color, `${poi.name}  ${Math.round(dist)}`);
  }

  private drawSpaceLabels(ctx: CanvasRenderingContext2D): void {
    if (this.cavern || this.mode === "cine") return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const planet of PLANETS) {
      const drawR = Math.max(planet.radius * this.zoom, 7);
      if (!this.inView(planet.x, planet.y, planet.radius + drawR / this.zoom + 40)) continue;
      const sx = (planet.x - this.camX) * this.zoom;
      const sy = (planet.y - this.camY) * this.zoom;
      const unlocked = this.isUnlocked(planet.id);
      ctx.globalAlpha = unlocked ? 0.95 : 0.62;
      ctx.fillStyle = "#eef3ff";
      ctx.font = "700 15px sans-serif";
      ctx.fillText(planet.name, sx, sy + drawR + 8);
      if (!unlocked) {
        ctx.fillStyle = "#ffb36b";
        ctx.font = "700 12px sans-serif";
        ctx.fillText("LOCKED", sx, sy + drawR + 24);
      }
    }
    if (this.inView(STATION.x, STATION.y, STATION.radius + 80)) {
      const sx = (STATION.x - this.camX) * this.zoom;
      const sy = (STATION.y - this.camY) * this.zoom;
      const drawR = Math.max(STATION.radius * this.markerBoost(STATION.radius * 2, 16) * this.zoom, 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#7ee7ff";
      ctx.font = "700 14px sans-serif";
      ctx.fillText(STATION.name, sx, sy + drawR + 6);
    }
    ctx.font = "700 12px sans-serif";
    for (const beacon of BEACONS) {
      if (this.beaconSpent[beacon.id]) continue;
      if (!this.inView(beacon.x, beacon.y, BEACON_CORE_R + 800)) continue;
      const sx = (beacon.x - this.camX) * this.zoom;
      const sy = (beacon.y - this.camY) * this.zoom;
      const core = Math.max(BEACON_CORE_R * this.zoom, 10);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = beacon.kind === "fuel" ? "#7ee7ff" : "#ff6b3d";
      ctx.fillText(beacon.kind === "fuel" ? "SIP" : "SCRAP", sx, sy + core + 6);
    }
    ctx.restore();
  }

  private drawEdgeMarker(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wy: number,
    color: string,
    label: string,
    telegraph = false,
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

    const breath = telegraph ? this.bossRadarBreath() : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (telegraph) {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.1 + breath * 0.34;
      ctx.beginPath();
      ctx.moveTo(16 + breath * 12, 0);
      ctx.lineTo(-14, 12 + breath * 4);
      ctx.lineTo(-14, -(12 + breath * 4));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.26 + breath * 0.48;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-1, 0, 7 + breath * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.78 + breath * 0.22;
    }
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

  /**
   * Living boss on this cavern. Color is that world's `PLANETS` accent
   * (Cinder `#ff6b3d`), not the boss sprite paint. Null once the boss is down.
   */
  private bossTelegraph(): { x: number; y: number; name: string; color: string } | null {
    const boss = this.boss;
    const planet = this.planet;
    if (this.zone !== "cavern" || !boss?.alive || !planet) return null;
    if (boss.def.planetId !== planet.id) return null;
    const accent = PLANETS.find((entry) => entry.id === planet.id)?.color;
    if (!accent) return null;
    return { x: boss.x, y: boss.y, name: boss.def.name, color: accent };
  }

  /** 0..1 soft neon breathe. Same clock for the pip and the edge arrow. */
  private bossRadarBreath(): number {
    return 0.5 + 0.5 * Math.sin(performance.now() * BOSS_RADAR_PULSE);
  }

  /** Corner-radar mark. The halo breathes; the core stays readable. No shadow blur. */
  private drawBossPip(ctx: CanvasRenderingContext2D, px: number, py: number, color: string): void {
    const t = this.bossRadarBreath();
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.1 + t * 0.32;
    ctx.beginPath();
    ctx.arc(px, py, 4 + t * 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.32 + t * 0.5;
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.arc(px, py, 3 + t * 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.84 + t * 0.16;
    ctx.beginPath();
    ctx.arc(px, py, 2.3 + t * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawBeacons(ctx: CanvasRenderingContext2D): void {
    const spin = performance.now() * 0.00045;
    const zoom = this.zoom;
    for (const beacon of BEACONS) {
      const showRing = zoom < 0.08 && this.inView(beacon.x, beacon.y, BEACON_RING_R);
      const core = this.worldSpanForScreen(BEACON_CORE_R, 10);
      const showCore = this.inView(beacon.x, beacon.y, core + 48);
      if (!showRing && !showCore) continue;
      const taken = this.beaconSpent[beacon.id] === 1;
      const color = beacon.kind === "fuel" ? "#7ee7ff" : "#ff6b3d";
      const x = this.rx(beacon.x);
      const y = this.ry(beacon.y);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, 2 / zoom);
      if (showRing) {
        ctx.globalAlpha = taken ? 0.14 : 0.38;
        ctx.beginPath();
        ctx.arc(x, y, BEACON_RING_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = taken ? 0.2 : 0.82;
        ctx.beginPath();
        ctx.arc(x, y, BEACON_RING_R, spin + beacon.id, spin + beacon.id + 1.35);
        ctx.stroke();
        ctx.globalAlpha = taken ? 0.12 : 0.4;
        ctx.beginPath();
        ctx.arc(x, y, BEACON_RING_R * 0.62, -spin * 1.4 + beacon.id * 0.2, -spin * 1.4 + beacon.id * 0.2 + 0.95);
        ctx.stroke();
      }
      if (showCore) {
        ctx.globalAlpha = taken ? 0.1 : 0.22;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, core * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = taken ? 0.34 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y - core);
        ctx.lineTo(x + core * 0.62, y);
        ctx.lineTo(x, y + core);
        ctx.lineTo(x - core * 0.62, y);
        ctx.closePath();
        ctx.fillStyle = "#000108";
        ctx.fill();
        ctx.lineWidth = Math.max(1.15, 1.8 / zoom);
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private pushBeaconPop(x: number, y: number, color: string): void {
    const list = this.beaconPops;
    if (list.length > 8) list.shift();
    list.push({ x, y, life: BEACON_POP, max: BEACON_POP, color });
  }

  private stepBeaconPops(dt: number): void {
    const list = this.beaconPops;
    if (list.length === 0) return;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const pop = list[i];
      if (!pop) continue;
      pop.life -= dt;
      if (pop.life > 0) list[w++] = pop;
    }
    list.length = w;
  }

  /**
   * One expanding stroke in the diamond's ink. Screen-sized so cruise zoom
   * still reads it. No fill and no shadow blur — mute does not hide it.
   */
  private drawBeaconPops(ctx: CanvasRenderingContext2D): void {
    const pops = this.beaconPops;
    if (pops.length === 0) return;
    const z = this.zoom;
    ctx.save();
    for (const pop of pops) {
      const t = 1 - clamp(pop.life / pop.max, 0, 1);
      const grow = 1 - (1 - t) * (1 - t);
      const fade = 1 - t * t;
      const core = Math.max(BEACON_CORE_R * z, 10);
      const screenR = core + 6 + grow * (58 + core * 0.4);
      if (!this.inView(pop.x, pop.y, (screenR + 12) / z)) continue;
      ctx.globalAlpha = 0.94 * fade;
      ctx.strokeStyle = pop.color;
      ctx.lineWidth = Math.max(1.35, 2.35 * (1 - t * 0.28)) / z;
      ctx.beginPath();
      ctx.arc(this.rx(pop.x), this.ry(pop.y), screenR / z, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHoles(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    const spin = now * 0.002;
    let nearId = -1;
    let nearT = 0;
    if (this.zone === "space" && this.holeLock <= 0) {
      const near = this.nearestHole(HOLE_PULL_R);
      if (near) {
        nearId = near.id;
        const d = Math.hypot(this.ship.x - near.x, this.ship.y - near.y);
        nearT = clamp(1 - d / HOLE_PULL_R, 0, 1);
      }
    }
    for (const hole of HOLES) {
      const pulling = hole.id === nearId && nearT > 0.03;
      const r = this.worldSpanForScreen(HOLE_VISUAL_R, 6);
      const ring = pulling ? r * (2.15 + nearT * 1.15) : r;
      if (!this.inView(hole.x, hole.y, Math.max(r * 2, ring))) continue;
      const x = this.rx(hole.x);
      const y = this.ry(hole.y);
      ctx.fillStyle = "#000108";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2 / this.zoom;
      ctx.strokeStyle = "#ff5ec8";
      ctx.beginPath();
      ctx.arc(x, y, r * 1.35, spin, spin + 4.2);
      ctx.stroke();
      ctx.strokeStyle = "#7ee7ff";
      ctx.beginPath();
      ctx.arc(x, y, r * 1.7, -spin * 1.3, -spin * 1.3 + 3.4);
      ctx.stroke();
      if (!pulling) continue;
      const pulse = 0.55 + 0.45 * Math.sin(now * 0.008);
      ctx.globalAlpha = (0.22 + nearT * 0.5) * pulse;
      ctx.lineWidth = Math.max(1.25, 1.8 / this.zoom);
      ctx.strokeStyle = "#7ee7ff";
      ctx.beginPath();
      ctx.arc(x, y, ring, spin * 1.6, spin * 1.6 + 1.45);
      ctx.stroke();
      ctx.strokeStyle = "#c77dff";
      ctx.beginPath();
      ctx.arc(x, y, ring * 1.14, -spin * 1.8, -spin * 1.8 + 1.7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Screen-edge swirl while the ship is inside a well, before the grab. */
  private drawHoleTelegraph(ctx: CanvasRenderingContext2D): void {
    if (this.mode === "menu" || this.mode === "over" || this.zone !== "space" || this.holeLock > 0) return;
    const hole = this.nearestHole(HOLE_PULL_R);
    if (!hole) return;
    const d = Math.hypot(this.ship.x - hole.x, this.ship.y - hole.y);
    const t = clamp(1 - d / HOLE_PULL_R, 0, 1);
    if (t < 0.03) return;
    const now = performance.now();
    const spin = now * 0.00115;
    const pulse = 0.6 + 0.4 * Math.sin(now * 0.0065);
    const alpha = (0.1 + t * 0.4) * pulse;
    const cx = this.w * 0.5;
    const cy = this.h * 0.5;
    const rx = this.w * 0.5 - 18;
    const ry = this.h * 0.5 - 18;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#7ee7ff";
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, spin, spin + 1.05);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, spin + 2.15, spin + 2.85);
    ctx.stroke();
    ctx.strokeStyle = "#c77dff";
    ctx.globalAlpha = alpha * 0.9;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 8, ry - 8, 0, -spin * 1.25, -spin * 1.25 + 1.35);
    ctx.stroke();
    ctx.strokeStyle = "#ff5ec8";
    ctx.globalAlpha = alpha * (0.35 + t * 0.4);
    const breathe = 1 + 0.015 * Math.sin(now * 0.0042);
    ctx.beginPath();
    ctx.ellipse(cx, cy, (rx - 16) * breathe, (ry - 16) * breathe, 0, spin * 0.6 + 0.8, spin * 0.6 + 2.1);
    ctx.stroke();
    ctx.restore();
  }

  /** Orange rim and a falling cyan streak as the dive opens. Strokes only. */
  private drawDiveFlash(ctx: CanvasRenderingContext2D): void {
    if (this.diveFlash <= 0 || this.zone !== "cavern") return;
    const a = clamp(this.diveFlash / DIVE_FLASH, 0, 1);
    const w = this.w;
    const h = this.h;
    const inset = Math.max(36, Math.min(w, h) * 0.1);
    const inner = inset + Math.max(16, Math.min(w, h) * 0.045);
    const fall = 1 - a;
    const head = h * (0.48 + fall * 0.78);
    const tail = head - h * 0.5;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8 + a * 10;
    ctx.strokeStyle = "#ff6b3d";
    ctx.globalAlpha = 0.4 + a * 0.55;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#7ee7ff";
    ctx.globalAlpha = 0.35 + a * 0.5;
    ctx.strokeRect(inner, inner, w - inner * 2, h - inner * 2);
    const y0 = Math.max(0, tail);
    const y1 = Math.min(h, head);
    if (y1 > y0 + 2) {
      const cx = w * 0.5;
      ctx.globalAlpha = 0.5 + a * 0.5;
      ctx.strokeStyle = "#7ee7ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 6, y0);
      ctx.lineTo(cx - 6, y1);
      ctx.stroke();
      ctx.globalAlpha = 0.55 + a * 0.45;
      ctx.strokeStyle = "#ff6b3d";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 7, y0);
      ctx.lineTo(cx + 7, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Grab flash on the frame border, then a short neon ring at arrival. */
  private drawFoldFx(ctx: CanvasRenderingContext2D): void {
    if (this.foldFlash <= 0 && this.foldPop <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    if (this.foldFlash > 0) {
      const a = clamp(this.foldFlash / FOLD_FLASH, 0, 1);
      const inset = 7;
      ctx.lineWidth = 8 + (1 - a) * 20;
      ctx.strokeStyle = a > 0.45 ? "#e8f7ff" : "#c77dff";
      ctx.globalAlpha = 0.32 + a * 0.58;
      ctx.strokeRect(inset, inset, this.w - inset * 2, this.h - inset * 2);
      ctx.strokeStyle = "#7ee7ff";
      ctx.globalAlpha = a * 0.5;
      ctx.lineWidth = 3;
      ctx.strokeRect(inset + 12, inset + 12, this.w - (inset + 12) * 2, this.h - (inset + 12) * 2);
    }
    if (this.foldPop > 0) {
      const life = clamp(this.foldPop / FOLD_POP, 0, 1);
      const grow = 1 - life;
      const cx = this.w * 0.5;
      const cy = this.h * 0.5;
      const radius = 16 + grow * Math.min(this.w, this.h) * 0.2;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#7ee7ff";
      ctx.globalAlpha = life * 0.92;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#c77dff";
      ctx.globalAlpha = life * 0.78;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ff5ec8";
      ctx.globalAlpha = life * 0.55;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.16, grow * 1.4, grow * 1.4 + 4.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Orange-cyan shatter on a breach, then a tight pop on the live hull. Strokes only. */
  private drawHullFlashes(ctx: CanvasRenderingContext2D): void {
    if (this.hullFlashes.length === 0) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const flash of this.hullFlashes) {
      if (flash.delay > 0) continue;
      const t = 1 - clamp(flash.life / flash.max, 0, 1);
      const live = flash.kind === "back" ? this.screenOf(this.ship.x, this.ship.y) : flash;
      if (flash.kind === "death") {
        const fade = (1 - t) * (1 - t * 0.2);
        ctx.globalAlpha = clamp(fade, 0, 1);
        this.strokeHullArcs(ctx, live.sx, live.sy, 26 + t * 96, "#ff8a3d", 2.6, t * 0.9, 0.36 + t * 0.4, 8);
        ctx.globalAlpha = clamp(fade * 0.95, 0, 1);
        this.strokeHullArcs(ctx, live.sx, live.sy, 14 + t * 60, "#7ee7ff", 1.8, -t * 1.2, 0.26 + t * 0.36, 6);
        ctx.globalAlpha = clamp(fade * 0.75, 0, 1);
        ctx.strokeStyle = "#ff8a3d";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ticks = 9;
        for (let i = 0; i < ticks; i++) {
          const a = t * 1.15 + (i / ticks) * Math.PI * 2;
          const inner = 18 + t * 48;
          const outer = inner + 8 + t * 18;
          ctx.moveTo(live.sx + Math.cos(a) * inner, live.sy + Math.sin(a) * inner);
          ctx.lineTo(live.sx + Math.cos(a) * outer, live.sy + Math.sin(a) * outer);
        }
        ctx.stroke();
      } else {
        const pop = 1 - (1 - t) * (1 - t);
        const fade = clamp(1 - t * t, 0, 1);
        ctx.globalAlpha = fade;
        this.strokeHullArcs(ctx, live.sx, live.sy, 12 + pop * 54, "#7ee7ff", 2.8, pop * 0.25, 0, 1);
        ctx.globalAlpha = fade * 0.92;
        this.strokeHullArcs(ctx, live.sx, live.sy, 7 + pop * 28, "#ff8a3d", 1.7, -pop * 0.2, 0, 1);
      }
    }
    ctx.restore();
  }

  private strokeHullArcs(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    width: number,
    spin: number,
    gap: number,
    segments: number,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (segments <= 1 || gap <= 0.02) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    const sweep = (Math.PI * 2) / segments;
    const open = sweep * clamp(gap, 0, 0.82);
    for (let i = 0; i < segments; i++) {
      const a0 = spin + i * sweep + open * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, radius, a0, a0 + Math.max(0.08, sweep - open));
      ctx.stroke();
    }
  }

  private drawPauseChart(ctx: CanvasRenderingContext2D): void {
    const mw = Math.min(320, Math.max(200, this.w * 0.36));
    const mh = mw * 0.75;
    const legendH = 22;
    const x = 16;
    const y = this.h - mh - 16 - legendH;
    if (y < 64) return;
    const plateX = x - 8;
    const plateY = y - 22;
    const plateW = mw + 16;
    const plateH = mh + 32 + legendH;
    ctx.save();
    ctx.fillStyle = "#000108";
    ctx.fillRect(plateX, plateY, plateW, plateH);
    ctx.strokeStyle = "rgba(126, 231, 255, 0.62)";
    ctx.lineWidth = 1;
    ctx.strokeRect(plateX, plateY, plateW, plateH);
    ctx.strokeStyle = "rgba(255, 107, 61, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plateX + 16, plateY);
    ctx.lineTo(plateX, plateY);
    ctx.lineTo(plateX, plateY + 16);
    ctx.moveTo(plateX + plateW - 16, plateY + plateH);
    ctx.lineTo(plateX + plateW, plateY + plateH);
    ctx.lineTo(plateX + plateW, plateY + plateH - 16);
    ctx.stroke();
    ctx.fillStyle = "#7ee7ff";
    ctx.font = "700 11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("CHARTED", x, y - 16);
    this.paintSpaceChart(ctx, x, y, mw, mh, true);
    ctx.strokeStyle = "rgba(126, 231, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + mh + 3);
    ctx.lineTo(x + mw, y + mh + 3);
    ctx.stroke();
    this.drawChartLegend(ctx, x, y + mh + 12, mw);
    ctx.restore();
  }

  /** Key for the Esc chart. Same colors as the pips; no chart math. */
  private drawChartLegend(ctx: CanvasRenderingContext2D, x: number, y: number, mw: number): void {
    const items: { label: string; ink: string; mark: "square" | "ring" }[] = [
      { label: "SCRAP", ink: "#ff6b3d", mark: "square" },
      { label: "SIP", ink: "#7ee7ff", mark: "square" },
      { label: "VOID-FOLD", ink: "#c77dff", mark: "ring" },
    ];
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.font = "700 10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const glyph = 8;
    const gap = 4;
    const widths = items.map((item) => glyph + gap + ctx.measureText(item.label).width);
    const used = widths.reduce((sum, w) => sum + w, 0);
    const between = items.length > 1 ? Math.max(6, (mw - used) / (items.length - 1)) : 0;
    let cursor = x;
    items.forEach((item, i) => {
      const gx = cursor + 3;
      if (item.mark === "square") {
        ctx.fillStyle = item.ink;
        ctx.fillRect(cursor, y - 3, 6, 6);
      } else {
        ctx.strokeStyle = item.ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(gx, y, 4, 0.5, 0.5 + Math.PI * 1.45);
        ctx.stroke();
        ctx.strokeStyle = "#7ee7ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(gx - 2.2, y);
        ctx.lineTo(gx + 2.2, y);
        ctx.moveTo(gx, y - 2.2);
        ctx.lineTo(gx, y + 2.2);
        ctx.stroke();
      }
      ctx.fillStyle = item.ink;
      ctx.fillText(item.label, cursor + glyph + gap, y);
      cursor += widths[i]! + between;
    });
    ctx.restore();
  }

  /**
   * Filled accent disc from `PLANETS.color`. Unvisited stays dim.
   * The first record this run adds one expanding stroke in that same accent.
   * No shadow blur — a thin ring that fades, then it is gone.
   */
  private drawChartPlanet(
    ctx: CanvasRenderingContext2D,
    planet: PlanetDef,
    px: number,
    py: number,
    disc: number,
    labeled: boolean,
    now: number,
  ): void {
    const seen = this.meta.visitedPlanets.includes(planet.id);
    ctx.globalAlpha = seen ? 1 : 0.5;
    ctx.fillStyle = planet.color;
    ctx.strokeStyle = planet.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, disc, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const t = this.chartPlanetPulseT(planet.id, now);
    if (t < 0) return;
    const grow = 1 - (1 - t) * (1 - t);
    const fade = (1 - t) * (1 - t);
    ctx.globalAlpha = 0.9 * fade;
    ctx.lineWidth = (labeled ? 1.55 : 1.2) * (1 - t * 0.35);
    ctx.beginPath();
    ctx.arc(px, py, disc + 1.15 + grow * (labeled ? 4.4 : 2.8), 0, Math.PI * 2);
    ctx.stroke();
  }

  /** 0..1 while the one-shot ring is live, or -1. Clock starts on the first chart paint. */
  private chartPlanetPulseT(id: string, now: number): number {
    let start = this.chartPulseAt.get(id);
    if (start == null) {
      if (!this.chartPulseArmed.has(id)) return -1;
      start = now;
      this.chartPulseAt.set(id, start);
      this.chartPulseArmed.delete(id);
    }
    const t = (now - start) / CHART_PLANET_PULSE_MS;
    if (t >= 1) {
      this.chartPulseAt.delete(id);
      return -1;
    }
    return t > 0 ? t : 0;
  }

  /** Visited cells lit, the rest of the panel left dark. Landmarks stay on top of the fog. */
  private paintSpaceChart(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    mw: number,
    mh: number,
    labeled: boolean,
  ): void {
    const sx = mw / SPACE_W;
    const sy = mh / SPACE_H;
    const cw = mw / CHART_COLS;
    const ch = mh / CHART_ROWS;
    ctx.fillStyle = "rgba(126, 231, 255, 0.22)";
    for (let i = 0; i < CHART_CELLS; i++) {
      if ((this.chart[i >> 3]! & (1 << (i & 7))) === 0) continue;
      const col = i % CHART_COLS;
      const row = (i / CHART_COLS) | 0;
      ctx.fillRect(x + col * cw, y + row * ch, cw + 0.6, ch + 0.6);
    }
    const pip = labeled ? 2.4 : 1.8;
    for (const beacon of BEACONS) {
      const taken = this.beaconSpent[beacon.id] === 1;
      ctx.globalAlpha = taken ? 0.2 : 0.5;
      ctx.fillStyle = beacon.kind === "fuel" ? "#7ee7ff" : "#ff6b3d";
      ctx.fillRect(x + beacon.x * sx - pip * 0.5, y + beacon.y * sy - pip * 0.5, pip, pip);
    }
    ctx.globalAlpha = 1;
    const chartNow = performance.now();
    for (const planet of PLANETS) {
      this.drawChartPlanet(
        ctx,
        planet,
        x + planet.x * sx,
        y + planet.y * sy,
        labeled ? 5 : 4,
        labeled,
        chartNow,
      );
    }
    ctx.globalAlpha = 1;
    for (const hole of HOLES) {
      const hx = x + hole.x * sx;
      const hy = y + hole.y * sy;
      const r = labeled ? 6 : 4.2;
      ctx.strokeStyle = "#c77dff";
      ctx.lineWidth = labeled ? 1.7 : 1.35;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0.5, 0.5 + Math.PI * 1.45);
      ctx.stroke();
      ctx.strokeStyle = "#7ee7ff";
      ctx.lineWidth = labeled ? 1.35 : 1.1;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.72, hy);
      ctx.lineTo(hx + r * 0.72, hy);
      ctx.moveTo(hx, hy - r * 0.72);
      ctx.lineTo(hx, hy + r * 0.72);
      ctx.stroke();
    }
    const hx = x + STATION.x * sx;
    const hy = y + STATION.y * sy;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = "#7ee7ff";
    ctx.fillStyle = "rgba(126, 231, 255, 0.35)";
    ctx.lineWidth = 1.4;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.restore();
    ctx.fillStyle = "#7ee7ff";
    ctx.font = "700 8px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("H", hx + 6, hy - 4);
    if (!labeled) {
      ctx.fillStyle = "#9aa6bf";
      const rocks = this.rocks;
      const n = rocks.length;
      const step = n > 20 ? Math.ceil(n / 20) : 1;
      for (let i = 0; i < n; i += step) {
        const rock = rocks[i];
        if (!rock) continue;
        ctx.fillRect(x + rock.x * sx, y + rock.y * sy, 2, 2);
      }
    }
    ctx.strokeStyle = "rgba(238, 243, 255, 0.22)";
    ctx.lineWidth = 1;
    const vw = Math.max(4, this.viewW() * sx);
    const vh = Math.max(3, this.viewH() * sy);
    ctx.strokeRect(x + this.camX * sx, y + this.camY * sy, vw, vh);
    const shipX = x + this.ship.x * sx;
    const shipY = y + this.ship.y * sy;
    if (labeled) {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = "#7ee7ff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(shipX, shipY, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#7ee7ff";
    ctx.beginPath();
    ctx.arc(shipX, shipY, labeled ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    const nav = this.closestPoi();
    ctx.strokeStyle = nav.color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + this.ship.x * sx, y + this.ship.y * sy);
    ctx.lineTo(x + nav.x * sx, y + nav.y * sy);
    ctx.stroke();
  }

  private drawMinimap(ctx: CanvasRenderingContext2D): void {
    const mw = 168;
    const mh = 126;
    const pad = 16;
    const x = pad;
    const y = Math.max(64, this.h - mh - pad - (this.cavern ? CAVERN_RADAR_LIFT : 0));
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
      const mark = this.bossTelegraph();
      if (mark) this.drawBossPip(ctx, x + mark.x * sx, y + mark.y * sy, mark.color);
    } else {
      this.paintSpaceChart(ctx, x, y, mw, mh, false);
    }
    ctx.restore();
  }

  private drawFps(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#eef3ff";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(String(this.fpsEma | 0), this.w - 10, 8);
    ctx.restore();
  }
}
