export type ShopId =
  | "twin"
  | "spread"
  | "rapid"
  | "pet"
  | "tank"
  | "cell"
  | "salvage"
  | "energy"
  | "fuel"
  | "engines";

export type ShopStatus = "ready" | "owned" | "broke" | "full";

/** Display groups only. Prices and buy rules stay on the row id. */
export type ShopSection = "weapons" | "engines" | "hull" | "consumables";

export const SHOP_SECTIONS: readonly { id: ShopSection; label: string }[] = [
  { id: "weapons", label: "Weapons" },
  { id: "engines", label: "Engines" },
  { id: "hull", label: "Hull" },
  { id: "consumables", label: "Consumables" },
];

export type ShopRow = {
  id: ShopId;
  section: ShopSection;
  name: string;
  blurb: string;
  price: number;
  status: ShopStatus;
  missing: number;
  detail: string;
};

export type ShopContext = {
  credits: number;
  cargo: number;
  rapid: boolean;
  twin: boolean;
  spread: boolean;
  pets: number;
  maxPets: number;
  maxFuel: number;
  maxEnergy: number;
  salvageRate: number;
  fuel: number;
  energy: number;
  tankMax: number;
  energyMax: number;
  engines: number;
  enginesMax: number;
  /** Rounded space cruise at the current engines level, u/s. */
  spaceSpeed: number;
  /** Rounded space cruise after the next engines buy, u/s. */
  nextSpaceSpeed: number;
};

export const SHOP_TANK_STEP = 15;
export const SHOP_CELL_STEP = 15;
export const SHOP_TANK_CAP = 200;
export const SHOP_CELL_CAP = 200;

const TWIN = 35;
const SPREAD = 45;
const RAPID = 40;
const PET = 50;
const TANK = 30;
const CELL = 28;
const SALVAGE_75 = 55;
const SALVAGE_100 = 80;
const ENERGY = 12;
const FUEL = 8;
const ENGINES = 45;

export function purseOf(ctx: ShopContext): number {
  return ctx.credits + Math.max(0, ctx.cargo);
}

function row(
  id: ShopId,
  section: ShopSection,
  name: string,
  blurb: string,
  price: number,
  ctx: ShopContext,
  extra: { owned?: boolean; full?: boolean },
): ShopRow {
  const purse = purseOf(ctx);
  let status: ShopStatus = "ready";
  if (extra.owned) status = "owned";
  else if (extra.full) status = "full";
  else if (purse < price) status = "broke";
  const missing = status === "broke" ? price - purse : 0;
  let detail = `${price} CR`;
  if (status === "owned") detail = "Owned";
  else if (status === "full") detail = "Maxed";
  else if (status === "broke") detail = `Need ${missing} more CR`;
  return { id, section, name, blurb, price, status, missing, detail };
}

function enginesRow(ctx: ShopContext): ShopRow {
  const maxed = ctx.engines >= ctx.enginesMax;
  const level = maxed ? ctx.enginesMax : ctx.engines + 1;
  const blurb = maxed
    ? `Space cruise ${ctx.spaceSpeed} u/s`
    : `Space cruise ${ctx.spaceSpeed} → ${ctx.nextSpaceSpeed} u/s`;
  return row("engines", "engines", `Engines Mk ${level}`, blurb, ENGINES, ctx, { full: maxed });
}

export function buildShopRows(ctx: ShopContext): ShopRow[] {
  const rows: ShopRow[] = [
    row("twin", "weapons", "Twin cannons", "Paired forward guns", TWIN, ctx, { owned: ctx.twin }),
    row("spread", "weapons", "Spread rack", "Three-way volley", SPREAD, ctx, { owned: ctx.spread }),
    row("rapid", "weapons", "Rapid feeder", "Faster fire rate", RAPID, ctx, { owned: ctx.rapid }),
    row("pet", "weapons", "Wingman drone", `Shooting pet (${ctx.pets}/${ctx.maxPets})`, PET, ctx, {
      owned: ctx.pets >= ctx.maxPets,
    }),
    enginesRow(ctx),
    row("tank", "hull", `Fuel tank +${SHOP_TANK_STEP}`, `Max fuel ${ctx.maxFuel} → ${ctx.maxFuel + SHOP_TANK_STEP}`, TANK, ctx, {
      full: ctx.maxFuel >= SHOP_TANK_CAP,
    }),
    row("cell", "hull", `Energy cell +${SHOP_CELL_STEP}`, `Max energy ${ctx.maxEnergy} → ${ctx.maxEnergy + SHOP_CELL_STEP}`, CELL, ctx, {
      full: ctx.maxEnergy >= SHOP_CELL_CAP,
    }),
  ];

  if (ctx.salvageRate < 0.75) {
    rows.push(row("salvage", "hull", "Salvage beacon 75%", "Rescue banks 75% of cargo", SALVAGE_75, ctx, {}));
  } else if (ctx.salvageRate < 1) {
    rows.push(row("salvage", "hull", "Salvage beacon 100%", "Rescue banks all cargo", SALVAGE_100, ctx, {}));
  } else {
    rows.push(row("salvage", "hull", "Salvage beacon 100%", "Already at full salvage", SALVAGE_100, ctx, { owned: true }));
  }

  rows.push(
    row("energy", "consumables", "Energy refill", "Top off shield cells", ENERGY, ctx, { full: ctx.energy >= ctx.energyMax - 0.5 }),
    row("fuel", "consumables", "Fuel top-off", "Fill the tank (burns in caverns)", FUEL, ctx, { full: ctx.fuel >= ctx.tankMax - 0.5 }),
  );
  return rows;
}
