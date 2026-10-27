export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function mulberry(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Cavern = {
  cols: number;
  rows: number;
  tile: number;
  width: number;
  height: number;
  solid: Uint8Array;
  spawnX: number;
  spawnY: number;
  bossX: number;
  bossY: number;
  fill: string;
  stroke: string;
  deep: string;
  minimap: HTMLCanvasElement;
};

export type PlanetDef = {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  atmosphere: string;
  fill: string;
  stroke: string;
  deep: string;
  cols: number;
  rows: number;
  tile: number;
  seed: number;
  walks: number;
  carve: number;
  pods: number;
  loot: number;
  fuel: number;
};

/**
 * Vanilla field was 32000 × 24000. Linear 200× is 6.4M × 4.8M.
 * The previous build stopped at 20× (640k × 480k) because a camera
 * translation that large jitters in canvas float32. Rendering is now
 * camera-local (float64 subtract, then a zoom-only transform), so the
 * full 200× field is safe. MAP_SCALE 10 is that step up from 640k × 480k.
 * Planet and Hab-7 coordinates below are the 640k chart times MAP_SCALE,
 * so hops stay the same fraction of the map.
 */
export const MAP_SCALE = 10;
export const SPACE_W = 640_000 * MAP_SCALE;
export const SPACE_H = 480_000 * MAP_SCALE;

/**
 * Gap from a planet's surface to the opening spawn.
 * Not scaled with the map: this stays a local hop outside the re-entry halo
 * (halo is radius + 520). 16000 is about 1.8s of *base* cruise (40% of
 * SPACE_W / 300), close to the old 2200px at 880 u/s, so Begin still
 * puts you beside Cinder instead of in the void.
 */
export const SPAWN_CLEARANCE = 16000;

export type StationDef = {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
};

/** Mid-map hub, a short hop off Cinder — not a planet cavern. */
export const STATION: StationDef = {
  id: "hab7",
  name: "Hab-7",
  x: 126000 * MAP_SCALE,
  y: 216000 * MAP_SCALE,
  radius: 96,
};

export const DOCK_RANGE = 420;

export type HoleDef = {
  id: number;
  x: number;
  y: number;
};

const HOLE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0.18, 0.22],
  [0.42, 0.16],
  [0.64, 0.3],
  [0.84, 0.18],
  [0.2, 0.76],
  [0.46, 0.7],
  [0.66, 0.84],
  [0.86, 0.68],
];

function buildHoles(): HoleDef[] {
  const rand = mulberry(4242);
  const holes: HoleDef[] = [];
  const planetClear = 140_000;
  const stationClear = 80_000;
  const holeClear = 700_000;
  for (const [ax, ay] of HOLE_ANCHORS) {
    let x = (ax + (rand() - 0.5) * 0.06) * SPACE_W;
    let y = (ay + (rand() - 0.5) * 0.06) * SPACE_H;
    for (let n = 0; n < 24; n++) {
      let bad = false;
      for (const planet of PLANETS) {
        const d = Math.hypot(x - planet.x, y - planet.y);
        if (d < planetClear) {
          const push = d > 1 ? planetClear / d : planetClear;
          x = planet.x + (x - planet.x) * push;
          y = planet.y + (y - planet.y) * push;
          bad = true;
        }
      }
      const sd = Math.hypot(x - STATION.x, y - STATION.y);
      if (sd < stationClear) {
        const push = sd > 1 ? stationClear / sd : stationClear;
        x = STATION.x + (x - STATION.x) * push;
        y = STATION.y + (y - STATION.y) * push;
        bad = true;
      }
      for (const hole of holes) {
        const d = Math.hypot(x - hole.x, y - hole.y);
        if (d < holeClear) {
          const push = d > 1 ? holeClear / d : holeClear;
          x = hole.x + (x - hole.x) * push;
          y = hole.y + (y - hole.y) * push;
          bad = true;
        }
      }
      x = clamp(x, SPACE_W * 0.08, SPACE_W * 0.92);
      y = clamp(y, SPACE_H * 0.08, SPACE_H * 0.92);
      if (!bad) break;
    }
    holes.push({ id: holes.length, x, y });
  }
  return holes;
}

export const PLANETS: PlanetDef[] = [
  {
    id: "cinder",
    name: "Cinder",
    x: 110000 * MAP_SCALE,
    y: 230000 * MAP_SCALE,
    radius: 240,
    color: "#ff6b3d",
    atmosphere: "rgba(255, 90, 40, 0.18)",
    fill: "#3a1610",
    stroke: "#e06030",
    deep: "#140806",
    cols: 200,
    rows: 150,
    tile: 36,
    seed: 11011,
    walks: 22,
    carve: 2,
    pods: 14,
    loot: 18,
    fuel: 10,
  },
  {
    id: "rime",
    name: "Rime",
    x: 310000 * MAP_SCALE,
    y: 60000 * MAP_SCALE,
    radius: 280,
    color: "#9ad8ff",
    atmosphere: "rgba(140, 210, 255, 0.16)",
    fill: "#102436",
    stroke: "#7ec8e8",
    deep: "#071018",
    cols: 220,
    rows: 140,
    tile: 36,
    seed: 22022,
    walks: 16,
    carve: 3,
    pods: 10,
    loot: 16,
    fuel: 12,
  },
  {
    id: "mycel",
    name: "Mycel",
    x: 70000 * MAP_SCALE,
    y: 420000 * MAP_SCALE,
    radius: 250,
    color: "#6fce7a",
    atmosphere: "rgba(90, 200, 110, 0.16)",
    fill: "#102414",
    stroke: "#62c56e",
    deep: "#07140c",
    cols: 210,
    rows: 160,
    tile: 36,
    seed: 33033,
    walks: 20,
    carve: 2,
    pods: 12,
    loot: 24,
    fuel: 11,
  },
  {
    id: "vesper",
    name: "Vesper",
    x: 510000 * MAP_SCALE,
    y: 80000 * MAP_SCALE,
    radius: 300,
    color: "#c9a6ff",
    atmosphere: "rgba(180, 120, 255, 0.16)",
    fill: "#1a1028",
    stroke: "#b07cff",
    deep: "#0c0814",
    cols: 240,
    rows: 170,
    tile: 36,
    seed: 44044,
    walks: 28,
    carve: 1,
    pods: 18,
    loot: 20,
    fuel: 9,
  },
  {
    id: "ashen",
    name: "Ashen",
    x: 240000 * MAP_SCALE,
    y: 360000 * MAP_SCALE,
    radius: 260,
    color: "#ff8a4d",
    atmosphere: "rgba(255, 120, 50, 0.16)",
    fill: "#2a120c",
    stroke: "#e07038",
    deep: "#120806",
    cols: 200,
    rows: 155,
    tile: 36,
    seed: 55055,
    walks: 18,
    carve: 2,
    pods: 13,
    loot: 16,
    fuel: 10,
  },
  {
    id: "brine",
    name: "Brine",
    x: 580000 * MAP_SCALE,
    y: 250000 * MAP_SCALE,
    radius: 290,
    color: "#3ec8c8",
    atmosphere: "rgba(50, 210, 210, 0.16)",
    fill: "#0c2428",
    stroke: "#3ec8c8",
    deep: "#061418",
    cols: 230,
    rows: 145,
    tile: 36,
    seed: 66066,
    walks: 14,
    carve: 3,
    pods: 11,
    loot: 20,
    fuel: 14,
  },
  {
    id: "thorn",
    name: "Thorn",
    x: 370000 * MAP_SCALE,
    y: 440000 * MAP_SCALE,
    radius: 255,
    color: "#c6e04a",
    atmosphere: "rgba(190, 220, 60, 0.15)",
    fill: "#1c2410",
    stroke: "#c6e04a",
    deep: "#0c1406",
    cols: 215,
    rows: 165,
    tile: 36,
    seed: 77077,
    walks: 24,
    carve: 1,
    pods: 16,
    loot: 18,
    fuel: 9,
  },
  {
    id: "helix",
    name: "Helix",
    x: 550000 * MAP_SCALE,
    y: 410000 * MAP_SCALE,
    radius: 310,
    color: "#ff5ec8",
    atmosphere: "rgba(255, 80, 200, 0.16)",
    fill: "#241018",
    stroke: "#ff5ec8",
    deep: "#14080e",
    cols: 250,
    rows: 175,
    tile: 36,
    seed: 88088,
    walks: 26,
    carve: 2,
    pods: 20,
    loot: 22,
    fuel: 10,
  },
];

/**
 * Eight seeded void folds. Anchors sit in the open field; a short nudge
 * keeps each one clear of planet solids, Hab-7, and the other folds.
 * Separation stays on the order of a long hop so they read as landmarks.
 */
export const HOLES: HoleDef[] = buildHoles();

export function generateCavern(planet: PlanetDef): Cavern {
  const { cols, rows, tile } = planet;
  const solid = new Uint8Array(cols * rows);
  solid.fill(1);
  const rand = mulberry(planet.seed);
  const { shaft, bossC, bossR } = bossAnchor(cols, rows);

  const carve = (c: number, r: number, rad: number): void => {
    for (let y = r - rad; y <= r + rad; y++) {
      for (let x = c - rad; x <= c + rad; x++) {
        if (x <= 0 || y <= 0 || x >= cols - 1 || y >= rows - 1) continue;
        if ((x - c) * (x - c) + (y - r) * (y - r) <= rad * rad + 1) {
          solid[y * cols + x] = 0;
        }
      }
    }
  };

  for (let r = 0; r < 9; r++) {
    for (let c = 1; c < cols - 1; c++) solid[r * cols + c] = 0;
  }
  for (let r = 0; r < 22; r++) carve(shaft, r, 3);

  for (let w = 0; w < planet.walks; w++) {
    let c = shaft + Math.floor((rand() - 0.5) * 16);
    let r = 14;
    const rad = planet.carve + (rand() < 0.35 ? 1 : 0);
    const steps = 280 + Math.floor(rand() * 220);
    for (let s = 0; s < steps; s++) {
      carve(c, r, rad);
      if (rand() < 0.08) carve(c, r, rad + 2);
      const pick = rand();
      if (pick < 0.38) r += 1;
      else if (pick < 0.58) c -= 1;
      else if (pick < 0.78) c += 1;
      else r -= 1;
      c = clamp(c, 3, cols - 4);
      r = clamp(r, 8, rows - 4);
    }
  }

  for (let i = 0; i < 12; i++) {
    const c = 8 + Math.floor(rand() * (cols - 16));
    const r = 16 + Math.floor(rand() * (rows - 24));
    const rw = 3 + Math.floor(rand() * 5);
    const rh = 2 + Math.floor(rand() * 4);
    for (let y = r - rh; y <= r + rh; y++) {
      for (let x = c - rw; x <= c + rw; x++) {
        if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1) solid[y * cols + x] = 0;
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    solid[c] = 1;
    solid[(rows - 1) * cols + c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    solid[r * cols] = 1;
    solid[r * cols + cols - 1] = 1;
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 1; c < cols - 1; c++) solid[r * cols + c] = 0;
  }
  for (let r = 0; r < 22; r++) carve(shaft, r, 3);

  carve(bossC, bossR, 9);
  carve(bossC - 6, bossR, 5);
  carve(bossC + 6, bossR + 2, 5);
  for (const cell of bossApproach(planet)) carve(cell.c, cell.r, 3);

  const spawnX = (shaft + 0.5) * tile;
  const spawnY = 7 * tile;
  const cavern: Cavern = {
    cols,
    rows,
    tile,
    width: cols * tile,
    height: rows * tile,
    solid,
    spawnX,
    spawnY,
    bossX: (bossC + 0.5) * tile,
    bossY: (bossR + 0.5) * tile,
    fill: planet.fill,
    stroke: planet.stroke,
    deep: planet.deep,
    minimap: document.createElement("canvas"),
  };
  paintMinimap(cavern);
  return cavern;
}

function paintMinimap(cav: Cavern): void {
  const mw = 168;
  const mh = 126;
  cav.minimap.width = mw;
  cav.minimap.height = mh;
  const ctx = cav.minimap.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = cav.deep;
  ctx.fillRect(0, 0, mw, mh);
  ctx.fillStyle = cav.stroke;
  const sx = mw / cav.cols;
  const sy = mh / cav.rows;
  for (let r = 0; r < cav.rows; r++) {
    let c = 0;
    while (c < cav.cols) {
      if (cav.solid[r * cav.cols + c] === 0) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < cav.cols && cav.solid[r * cav.cols + c] === 1) c += 1;
      ctx.fillRect(start * sx, r * sy, (c - start) * sx, Math.max(1, sy));
    }
  }
}

export function solidAt(cav: Cavern, x: number, y: number): boolean {
  const c = Math.floor(x / cav.tile);
  const r = Math.floor(y / cav.tile);
  if (c < 0 || r < 0 || c >= cav.cols || r >= cav.rows) return true;
  return cav.solid[r * cav.cols + c] === 1;
}

export function circleHitsSolid(cav: Cavern, x: number, y: number, rad: number): boolean {
  const t = cav.tile;
  const c0 = Math.floor((x - rad) / t);
  const c1 = Math.floor((x + rad) / t);
  const r0 = Math.floor((y - rad) / t);
  const r1 = Math.floor((y + rad) / t);
  const r2 = rad * rad;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= cav.cols || r >= cav.rows) return true;
      if (cav.solid[r * cav.cols + c] === 0) continue;
      const closestX = clamp(x, c * t, (c + 1) * t);
      const closestY = clamp(y, r * t, (r + 1) * t);
      const dx = x - closestX;
      const dy = y - closestY;
      if (dx * dx + dy * dy < r2) return true;
    }
  }
  return false;
}

export function moveAgainst(
  cav: Cavern,
  x: number,
  y: number,
  vx: number,
  vy: number,
  rad: number,
  rest: number,
): { x: number; y: number; vx: number; vy: number; hit: boolean } {
  let nx = x + vx;
  let ny = y;
  let nvx = vx;
  let nvy = vy;
  let hit = false;
  if (circleHitsSolid(cav, nx, ny, rad)) {
    nx = x;
    nvx *= -rest;
    hit = true;
  }
  ny = y + vy;
  if (circleHitsSolid(cav, nx, ny, rad)) {
    ny = y;
    nvy *= -rest;
    hit = true;
  }
  return { x: nx, y: ny, vx: nvx, vy: nvy, hit };
}

export function drawCavern(
  ctx: CanvasRenderingContext2D,
  cav: Cavern,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  zoom = 1,
  originX = 0,
  originY = 0,
): void {
  ctx.fillStyle = cav.deep;
  // Background is in camera-local space, same as the tiles below.
  ctx.fillRect(camX - originX - 4, camY - originY - 4, viewW + 8, viewH + 8);
  const t = cav.tile;
  const c0 = Math.max(0, Math.floor(camX / t) - 1);
  const c1 = Math.min(cav.cols - 1, Math.floor((camX + viewW) / t) + 1);
  const r0 = Math.max(0, Math.floor(camY / t) - 1);
  const r1 = Math.min(cav.rows - 1, Math.floor((camY + viewH) / t) + 1);
  ctx.fillStyle = cav.fill;
  // Edge strokes vanish when a tile is a couple of screen pixels; skip the path.
  const strokeEdges = t * zoom >= 2.4;
  if (strokeEdges) {
    ctx.strokeStyle = cav.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
  }
  for (let r = r0; r <= r1; r++) {
    let c = c0;
    while (c <= c1) {
      if (cav.solid[r * cav.cols + c] === 0) {
        c += 1;
        continue;
      }
      const start = c;
      while (c <= c1 && cav.solid[r * cav.cols + c] === 1) c += 1;
      const x = start * t - originX;
      const y = r * t - originY;
      const w = (c - start) * t;
      ctx.fillRect(x, y, w, t);
      if (strokeEdges && r > 0 && cav.solid[(r - 1) * cav.cols + start] === 0) {
        ctx.moveTo(x, y + 0.5);
        ctx.lineTo(x + w, y + 0.5);
      }
    }
  }
  if (strokeEdges) ctx.stroke();
}

function bossAnchor(cols: number, rows: number): { shaft: number; bossC: number; bossR: number } {
  return {
    shaft: Math.floor(cols / 2),
    bossC: clamp(Math.floor(cols * 0.7), 18, cols - 18),
    bossR: rows - 22,
  };
}

/** Open cells along the carved run from the entry shaft to the boss room. */
export function bossApproach(planet: PlanetDef): { c: number; r: number }[] {
  const { shaft, bossC, bossR } = bossAnchor(planet.cols, planet.rows);
  const cells: { c: number; r: number }[] = [];
  let cc = shaft;
  let rr = 18;
  while (rr < bossR || Math.abs(cc - bossC) > 1) {
    cells.push({ c: cc, r: rr });
    if (rr < bossR) rr += 1;
    if (cc < bossC) cc += 1;
    else if (cc > bossC) cc -= 1;
  }
  return cells;
}

export function emptySpots(cav: Cavern, count: number, seed: number, minRow = 18): { x: number; y: number }[] {
  const rand = mulberry(seed);
  const spots: { x: number; y: number }[] = [];
  let guard = 0;
  while (spots.length < count && guard < count * 40) {
    guard += 1;
    const c = 4 + Math.floor(rand() * (cav.cols - 8));
    const r = minRow + Math.floor(rand() * (cav.rows - minRow - 4));
    if (cav.solid[r * cav.cols + c] !== 0) continue;
    spots.push({
      x: (c + 0.5) * cav.tile,
      y: (r + 0.5) * cav.tile,
    });
  }
  return spots;
}

export function inExitShaft(cav: Cavern, x: number, y: number): boolean {
  return y < cav.tile * 11 && Math.abs(x - cav.spawnX) < cav.tile * 5;
}
