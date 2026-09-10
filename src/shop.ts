export type ShopId =
  | "twin"
  | "spread"
  | "rapid"
  | "pet"
  | "tank"
  | "cell"
  | "salvage"
  | "energy"
  | "fuel";

export type ShopStatus = "ready" | "owned" | "broke" | "full";

export type ShopRow = {
  id: ShopId;
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

export function purseOf(ctx: ShopContext): number {
  return ctx.credits + Math.max(0, ctx.cargo);
}

function row(
  id: ShopId,
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
  return { id, name, blurb, price, status, missing, detail };
}

export function buildShopRows(ctx: ShopContext): ShopRow[] {
  const rows: ShopRow[] = [
    row("twin", "Twin cannons", "Paired forward guns", TWIN, ctx, { owned: ctx.twin }),
    row("spread", "Spread rack", "Three-way volley", SPREAD, ctx, { owned: ctx.spread }),
    row("rapid", "Rapid feeder", "Faster fire rate", RAPID, ctx, { owned: ctx.rapid }),
    row("pet", "Wingman drone", `Shooting pet (${ctx.pets}/${ctx.maxPets})`, PET, ctx, {
      owned: ctx.pets >= ctx.maxPets,
    }),
    row("tank", `Fuel tank +${SHOP_TANK_STEP}`, `Max fuel ${ctx.maxFuel} → ${ctx.maxFuel + SHOP_TANK_STEP}`, TANK, ctx, {
      full: ctx.maxFuel >= SHOP_TANK_CAP,
    }),
    row("cell", `Energy cell +${SHOP_CELL_STEP}`, `Max energy ${ctx.maxEnergy} → ${ctx.maxEnergy + SHOP_CELL_STEP}`, CELL, ctx, {
      full: ctx.maxEnergy >= SHOP_CELL_CAP,
    }),
  ];

  if (ctx.salvageRate < 0.75) {
    rows.push(row("salvage", "Salvage beacon 75%", "Rescue banks 75% of cargo", SALVAGE_75, ctx, {}));
  } else if (ctx.salvageRate < 1) {
    rows.push(row("salvage", "Salvage beacon 100%", "Rescue banks all cargo", SALVAGE_100, ctx, {}));
  } else {
    rows.push(row("salvage", "Salvage beacon 100%", "Already at full salvage", SALVAGE_100, ctx, { owned: true }));
  }

  rows.push(
    row("energy", "Energy refill", "Top off shield cells", ENERGY, ctx, { full: ctx.energy >= ctx.energyMax - 0.5 }),
    row("fuel", "Fuel top-off", "Fill the tank (burns in caverns)", FUEL, ctx, { full: ctx.fuel >= ctx.tankMax - 0.5 }),
  );
  return rows;
}
