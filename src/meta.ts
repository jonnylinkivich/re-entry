export type PlanetId = "cinder" | "rime" | "mycel" | "vesper";

export type MetaState = {
  credits: number;
  keys: string[];
  maxFuel: number;
  maxEnergy: number;
  salvageRate: number;
  high: number;
  muted: boolean;
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
  };
}

export function planetUnlocked(id: string, keys: readonly string[]): boolean {
  if (id === "cinder") return true;
  if (id === "rime") return keys.includes("cinder");
  if (id === "mycel") return keys.includes("rime");
  if (id === "vesper") return keys.includes("mycel");
  return false;
}

export function neededKey(id: string): string | null {
  if (id === "rime") return "cinder";
  if (id === "mycel") return "rime";
  if (id === "vesper") return "mycel";
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
  if (!keys.includes("cinder")) return "Defeat Ember Warden";
  if (!keys.includes("rime")) return "Defeat Frost Crown";
  if (!keys.includes("mycel")) return "Defeat Sporeheart";
  if (!keys.includes("vesper")) return "Defeat Night Veil";
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
