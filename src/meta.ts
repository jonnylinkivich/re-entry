import { SPACE_H, SPACE_W } from "./cavern.ts";

export type PlanetId =
  | "cinder"
  | "rime"
  | "mycel"
  | "vesper"
  | "ashen"
  | "brine"
  | "thorn"
  | "helix";

/** Sequential key chain. Cinder is open; each later world needs the previous key. */
const UNLOCK_NEED: Record<PlanetId, string | null> = {
  cinder: null,
  rime: "cinder",
  mycel: "rime",
  vesper: "mycel",
  ashen: "vesper",
  brine: "ashen",
  thorn: "brine",
  helix: "thorn",
};

const GATE_OBJECTIVE: { key: string; text: string }[] = [
  { key: "cinder", text: "Defeat Ember Warden" },
  { key: "rime", text: "Defeat Frost Crown" },
  { key: "mycel", text: "Defeat Sporeheart" },
  { key: "vesper", text: "Defeat Night Veil" },
  { key: "ashen", text: "Defeat Ash Colossus" },
  { key: "brine", text: "Defeat Tide Serpent" },
  { key: "thorn", text: "Defeat Bramble King" },
  { key: "helix", text: "Defeat Coil Warden" },
];

export const ALL_PLANET_KEYS: PlanetId[] = [
  "cinder",
  "rime",
  "mycel",
  "vesper",
  "ashen",
  "brine",
  "thorn",
  "helix",
];

export type MetaState = {
  credits: number;
  keys: string[];
  maxFuel: number;
  maxEnergy: number;
  salvageRate: number;
  high: number;
  muted: boolean;
  rapid: boolean;
  twin: boolean;
  spread: boolean;
  pets: number;
  /** Hab-7 engines level, 0..ENGINES_MAX. Raises space cruise only. */
  engines: number;
  /** Base64 bitset of open-space chart cells the ship has crossed. */
  visited: string;
  /** Planet ids the player has actually entered. */
  visitedPlanets: string[];
};

/** Open-space chart. 40×30 cells of 160000² — one cell per frame at full cruise. */
export const CHART_COLS = 40;
export const CHART_ROWS = 30;
export const CHART_CELLS = CHART_COLS * CHART_ROWS;
const CHART_BYTES = CHART_CELLS / 8;

export const START_MAX_FUEL = 40;
export const START_MAX_ENERGY = 40;
export const START_SALVAGE = 0.5;
export const RESCUE_FEE = 15;
export const FUEL_IDLE = 0.6;
export const FUEL_THRUST = 9;
export const ENERGY_DRAIN = 11;
export const ENERGY_HIT = 16;
/** Hab-7 Engines row. Level 5 crosses the 6.4M long axis in ~5 min. */
export const ENGINES_MAX = 5;

const SAVE_KEY = "reentry-save";
const HIGH_KEY = "reentry-highscore";
const CREDIT_KEY = "reentry-credits";
const OLD_HIGH = "drift-highscore";
const OLD_CREDIT = "drift-credits";

const DEFAULTS: MetaState = {
  credits: 0,
  keys: [],
  maxFuel: START_MAX_FUEL,
  maxEnergy: START_MAX_ENERGY,
  salvageRate: START_SALVAGE,
  high: 0,
  muted: false,
  rapid: false,
  twin: false,
  spread: false,
  pets: 0,
  engines: 0,
  visited: "",
  visitedPlanets: [],
};

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? "") || 0;
  } catch {
    return 0;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadMeta(): MetaState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MetaState>;
      return normalizeMeta(parsed);
    }
  } catch {
    /* fall through to legacy keys */
  }
  const migrated: MetaState = {
    ...DEFAULTS,
    credits: readNumber(CREDIT_KEY) || readNumber(OLD_CREDIT),
    high: readNumber(HIGH_KEY) || readNumber(OLD_HIGH),
  };
  saveMeta(migrated);
  return migrated;
}

export function saveMeta(meta: MetaState): void {
  const next = normalizeMeta(meta);
  writeRaw(SAVE_KEY, JSON.stringify(next));
  writeRaw(HIGH_KEY, String(next.high));
  writeRaw(CREDIT_KEY, String(next.credits));
}

export function normalizeMeta(partial: Partial<MetaState>): MetaState {
  const keys = Array.isArray(partial.keys)
    ? partial.keys.filter((k): k is string => typeof k === "string")
    : [];
  return {
    credits: Math.max(0, Math.floor(partial.credits ?? DEFAULTS.credits)),
    keys: [...new Set(keys)],
    maxFuel: Math.max(START_MAX_FUEL, Math.floor(partial.maxFuel ?? DEFAULTS.maxFuel)),
    maxEnergy: Math.max(START_MAX_ENERGY, Math.floor(partial.maxEnergy ?? DEFAULTS.maxEnergy)),
    salvageRate: clamp(partial.salvageRate ?? DEFAULTS.salvageRate, 0.5, 1),
    high: Math.max(0, Math.floor(partial.high ?? DEFAULTS.high)),
    muted: Boolean(partial.muted),
    rapid: Boolean(partial.rapid),
    twin: Boolean(partial.twin),
    spread: Boolean(partial.spread),
    pets: clamp(Math.floor(partial.pets ?? 0), 0, 2),
    engines: clamp(Math.floor(partial.engines ?? 0) || 0, 0, ENGINES_MAX),
    visited: normalizeVisited(partial.visited),
    visitedPlanets: normalizeVisitedPlanets(partial.visitedPlanets),
  };
}

export function emptyChart(): Uint8Array {
  return new Uint8Array(CHART_BYTES);
}

export function chartFromString(raw: string): Uint8Array {
  const out = emptyChart();
  if (!raw) return out;
  try {
    const bin = atob(raw);
    const n = Math.min(bin.length, CHART_BYTES);
    for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i) & 255;
  } catch {
    /* bad save — treat as uncharted */
  }
  return out;
}

export function chartToString(bits: Uint8Array): string {
  let any = false;
  let s = "";
  for (let i = 0; i < CHART_BYTES; i++) {
    const b = bits[i] ?? 0;
    if (b) any = true;
    s += String.fromCharCode(b);
  }
  return any ? btoa(s) : "";
}

export function chartIndex(x: number, y: number): number {
  const col = clamp(Math.floor((x / SPACE_W) * CHART_COLS), 0, CHART_COLS - 1);
  const row = clamp(Math.floor((y / SPACE_H) * CHART_ROWS), 0, CHART_ROWS - 1);
  return row * CHART_COLS + col;
}

/** Returns true when the cell flips from unvisited to visited. */
export function markChart(bits: Uint8Array, index: number): boolean {
  if (index < 0 || index >= CHART_CELLS) return false;
  const byte = index >> 3;
  const mask = 1 << (index & 7);
  const cur = bits[byte] ?? 0;
  if ((cur & mask) !== 0) return false;
  bits[byte] = cur | mask;
  return true;
}

export function chartCellLit(bits: Uint8Array, index: number): boolean {
  if (index < 0 || index >= CHART_CELLS) return false;
  const cur = bits[index >> 3] ?? 0;
  return (cur & (1 << (index & 7))) !== 0;
}

function normalizeVisited(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  return chartToString(chartFromString(raw));
}

function normalizeVisitedPlanets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allow = new Set<string>(ALL_PLANET_KEYS);
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id === "string" && allow.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function planetUnlocked(id: string, keys: readonly string[]): boolean {
  const need = neededKey(id);
  return need === null || keys.includes(need);
}

export function neededKey(id: string): string | null {
  if (id in UNLOCK_NEED) return UNLOCK_NEED[id as PlanetId];
  return null;
}

export function titleKey(id: string): string {
  const name = id.charAt(0).toUpperCase() + id.slice(1);
  return `${name} Key`;
}

export function salvageLabel(rate: number): string {
  return `Salvage ${Math.round(rate * 100)}%`;
}

export function gateObjective(keys: readonly string[]): string {
  for (const step of GATE_OBJECTIVE) {
    if (!keys.includes(step.key)) return step.text;
  }
  return "All keys recovered";
}

export function lockPrompt(planetName: string, keyId: string): string {
  return `${planetName.toUpperCase()} LOCKED — need ${titleKey(keyId)}`;
}

export function playtestFlags(): { boost: boolean; unlock: boolean } {
  try {
    const q = new URLSearchParams(location.search);
    return { boost: q.has("playtest") || q.has("boost"), unlock: q.has("unlock") };
  } catch {
    return { boost: false, unlock: false };
  }
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}
