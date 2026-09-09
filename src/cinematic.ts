import type { PlanetDef } from "./cavern.ts";

const PW = 160;
const PH = 90;
const DURATION = 3.6;

const FONT: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [3, 4, 4, 4, 3],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [7, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5],
  N: [5, 7, 7, 7, 5],
  O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 7, 3],
  R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 7, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  "-": [0, 0, 7, 0, 0],
  " ": [0, 0, 0, 0, 0],
};

type Ember = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export class ReentryCine {
  done = false;
  private time = 0;
  private buf: HTMLCanvasElement;
  private gfx: CanvasRenderingContext2D;
  private embers: Ember[] = [];
  private stars: { x: number; y: number; s: number }[] = [];
  private planet: PlanetDef;

  constructor(planet: PlanetDef) {
    this.planet = planet;
    this.buf = document.createElement("canvas");
    this.buf.width = PW;
    this.buf.height = PH;
    const gfx = this.buf.getContext("2d");
    if (!gfx) throw new Error("RE-ENTRY cinematic failed to allocate a buffer.");
    this.gfx = gfx;
    for (let i = 0; i < 48; i++) {
      this.stars.push({
        x: Math.random() * PW,
        y: Math.random() * 50,
        s: Math.random() < 0.2 ? 2 : 1,
      });
    }
  }

  skip(): void {
    this.done = true;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time >= DURATION) this.done = true;
    if (this.time > 0.7 && this.time < 3.1) {
      for (let i = 0; i < 3; i++) {
        this.embers.push({
          x: 78 + Math.random() * 6,
          y: this.shipY() + 6,
          vx: (Math.random() - 0.5) * 18,
          vy: 12 + Math.random() * 28,
          life: 0.25 + Math.random() * 0.35,
          color: Math.random() < 0.5 ? "#ff9a3c" : "#ffe56b",
        });
      }
    }
    const next: Ember[] = [];
    for (const e of this.embers) {
      e.life -= dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.life > 0) next.push(e);
    }
    this.embers = next;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.render();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const scale = Math.max(1, Math.floor(Math.min(w / PW, h / PH)));
    const dw = PW * scale;
    const dh = PH * scale;
    const ox = Math.floor((w - dw) / 2);
    const oy = Math.floor((h - dh) / 2);
    const shake = this.time > 1.4 && this.time < 3.1 ? (Math.random() < 0.5 ? -scale : scale) : 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, PW, PH, ox + shake, oy, dw, dh);
    ctx.imageSmoothingEnabled = true;
  }

  private shipY(): number {
    const t = this.time;
    if (t < 0.55) return -12;
    return -12 + (t - 0.55) * 38;
  }

  private planetR(): number {
    return 18 + Math.min(70, this.time * 28);
  }

  private render(): void {
    const g = this.gfx;
    const t = this.time;
    g.fillStyle = "#000008";
    g.fillRect(0, 0, PW, PH);

    const sky = Math.min(1, Math.max(0, (t - 1.1) / 1.4));
    if (sky > 0) {
      g.fillStyle = hexAlpha(this.planet.color, 0.12 + sky * 0.35);
      g.fillRect(0, 0, PW, PH);
    }

    g.fillStyle = "#f4f7ff";
    for (const star of this.stars) {
      if (t > 1.8 && Math.random() < 0.04) continue;
      g.fillRect(star.x, star.y + t * 6, star.s, star.s);
    }

    const pr = this.planetR();
    const px = 80;
    const py = 118 - t * 14;
    g.fillStyle = this.planet.color;
    g.beginPath();
    g.arc(px, py, pr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.22)";
    g.beginPath();
    g.arc(px - pr * 0.28, py - pr * 0.3, pr * 0.34, 0, Math.PI * 2);
    g.fill();

    if (t > 1.35) {
      const band = Math.min(24, (t - 1.35) * 22);
      g.fillStyle = "#ff6a18";
      g.fillRect(0, 52, PW, band);
      g.fillStyle = "#ffd24a";
      g.fillRect(0, 52, PW, Math.max(2, band * 0.35));
    }

    for (const e of this.embers) {
      g.globalAlpha = Math.max(0, e.life * 3);
      g.fillStyle = e.color;
      g.fillRect(e.x | 0, e.y | 0, 2, 2);
    }
    g.globalAlpha = 1;

    this.drawShip(g, 80, this.shipY(), t > 1.2);

    if (t > 2.85) {
      const flash = Math.min(1, (t - 2.85) / 0.45);
      g.fillStyle = `rgba(255, 236, 210, ${flash})`;
      g.fillRect(0, 0, PW, PH);
    }

    for (let y = 0; y < PH; y += 2) {
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.fillRect(0, y, PW, 1);
    }

    g.fillStyle = "#ffe56b";
    blitText(g, "RE-ENTRY", 52, 4, 1);
    g.fillStyle = "#ffffff";
    blitText(g, this.planet.name.toUpperCase(), 80 - this.planet.name.length * 2, 12, 1);

    if (t < 2.8) {
      g.fillStyle = "#9aa3b8";
      blitText(g, "PRESS  E  TO SKIP", 44, 82, 1);
    }
  }

  private drawShip(g: CanvasRenderingContext2D, x: number, y: number, hot: boolean): void {
    const ox = Math.round(x);
    const oy = Math.round(y);
    g.fillStyle = hot ? "#ffd24a" : "#7ee7ff";
    const hull = [
      [0, 0, 1, 1],
      [-1, 1, 3, 1],
      [-2, 2, 5, 1],
      [-3, 3, 7, 2],
      [-2, 5, 2, 1],
      [1, 5, 2, 1],
    ];
    for (const [dx, dy, w, h] of hull) {
      g.fillRect(ox + dx, oy + dy, w, h);
    }
    if (hot) {
      g.fillStyle = "#ff6a18";
      g.fillRect(ox - 1, oy + 6, 1, 3);
      g.fillRect(ox + 1, oy + 6, 1, 4);
      g.fillRect(ox, oy + 6, 1, 5);
    }
  }
}

export class RescueCine {
  done = false;
  private time = 0;
  private buf: HTMLCanvasElement;
  private gfx: CanvasRenderingContext2D;
  private sparks: Ember[] = [];
  private rate: number;

  constructor(salvageRate: number) {
    this.rate = salvageRate;
    this.buf = document.createElement("canvas");
    this.buf.width = PW;
    this.buf.height = PH;
    const gfx = this.buf.getContext("2d");
    if (!gfx) throw new Error("RE-ENTRY rescue cinematic failed to allocate a buffer.");
    this.gfx = gfx;
  }

  skip(): void {
    this.done = true;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time >= 2.35) this.done = true;
    for (let i = 0; i < 4; i++) {
      this.sparks.push({
        x: 72 + Math.random() * 16,
        y: 88,
        vx: (Math.random() - 0.5) * 10,
        vy: -40 - Math.random() * 50,
        life: 0.3 + Math.random() * 0.35,
        color: Math.random() < 0.5 ? "#7ee7ff" : "#ffe56b",
      });
    }
    const next: Ember[] = [];
    for (const e of this.sparks) {
      e.life -= dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.life > 0) next.push(e);
    }
    this.sparks = next;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.render();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const scale = Math.max(1, Math.floor(Math.min(w / PW, h / PH)));
    const dw = PW * scale;
    const dh = PH * scale;
    const ox = Math.floor((w - dw) / 2);
    const oy = Math.floor((h - dh) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, PW, PH, ox, oy, dw, dh);
    ctx.imageSmoothingEnabled = true;
  }

  private shipY(): number {
    return 62 - this.time * 22;
  }

  private render(): void {
    const g = this.gfx;
    const t = this.time;
    g.fillStyle = "#05080e";
    g.fillRect(0, 0, PW, PH);
    g.fillStyle = "rgba(126, 231, 255, 0.12)";
    g.fillRect(70, 0, 20, PH);
    g.fillStyle = "rgba(255, 229, 107, 0.18)";
    g.fillRect(74, 0, 12, PH);

    for (const e of this.sparks) {
      g.globalAlpha = Math.max(0, e.life * 3);
      g.fillStyle = e.color;
      g.fillRect(e.x | 0, e.y | 0, 2, 2);
    }
    g.globalAlpha = 1;

    const oy = Math.round(this.shipY());
    g.fillStyle = "#7ee7ff";
    g.fillRect(78, oy, 5, 8);
    g.fillRect(76, oy + 3, 9, 3);

    g.fillStyle = "#ffe56b";
    blitText(g, "RESCUE BEAM", 46, 6, 1);
    g.fillStyle = "#ffffff";
    const haul = this.rate >= 1 ? "FULL CARGO" : this.rate >= 0.75 ? "MOST CARGO" : "HALF CARGO";
    blitText(g, haul, 80 - haul.length * 2, 14, 1);
    if (t < 1.8) {
      g.fillStyle = "#9aa3b8";
      blitText(g, "PRESS  E  TO SKIP", 44, 82, 1);
    }
  }
}

function blitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number): void {
  let cx = x;
  for (const raw of text) {
    const ch = raw === " " ? " " : raw.toUpperCase();
    const rows = FONT[ch] ?? FONT["-"];
    if (!rows) {
      cx += 4 * scale;
      continue;
    }
    for (let r = 0; r < 5; r++) {
      const bits = rows[r] ?? 0;
      for (let c = 0; c < 3; c++) {
        if (bits & (4 >> c)) g.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += 4 * scale;
  }
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
