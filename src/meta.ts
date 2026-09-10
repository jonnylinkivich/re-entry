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
};

export const START_MAX_FUEL = 40;
export const START_MAX_ENERGY = 40;
export const START_SALVAGE = 0.5;
export const RESCUE_FEE = 15;
export const FUEL_IDLE = 0.6;
export const FUEL_THRUST = 9;
export const ENERGY_DRAIN = 11;
export const ENERGY_HIT = 16;

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
  };
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
