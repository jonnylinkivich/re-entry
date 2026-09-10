import { circleHitsSolid, moveAgainst, type Cavern } from "./cavern.ts";

export type BossKind = "ember" | "frost" | "spore" | "veil" | "ash" | "tide" | "bramble" | "coil";

export type BossDef = {
  planetId: string;
  kind: BossKind;
  name: string;
  keyId: string | null;
  tankBonus: number;
  salvage: number | null;
  hp: number;
  radius: number;
  color: string;
};

export type BossShot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  radius: number;
  color: string;
  homing: boolean;
};

export type SpawnRockFn = (x: number, y: number, size: number) => void;

export const BOSS_BY_PLANET: Record<string, BossDef> = {
  cinder: {
    planetId: "cinder",
    kind: "ember",
    name: "Ember Warden",
    keyId: "cinder",
    tankBonus: 20,
    salvage: null,
    hp: 72,
    radius: 34,
    color: "#ff6b3d",
  },
  rime: {
    planetId: "rime",
    kind: "frost",
    name: "Frost Crown",
    keyId: "rime",
    tankBonus: 18,
    salvage: 0.75,
    hp: 84,
    radius: 36,
    color: "#9ad8ff",
  },
  mycel: {
    planetId: "mycel",
    kind: "spore",
    name: "Sporeheart",
    keyId: "mycel",
    tankBonus: 20,
    salvage: 1,
    hp: 96,
    radius: 38,
    color: "#6fce7a",
  },
  vesper: {
    planetId: "vesper",
    kind: "veil",
    name: "Night Veil",
    keyId: "vesper",
    tankBonus: 24,
    salvage: null,
    hp: 110,
    radius: 40,
    color: "#c9a6ff",
  },
  ashen: {
    planetId: "ashen",
    kind: "ash",
    name: "Ash Colossus",
    keyId: "ashen",
    tankBonus: 16,
    salvage: null,
    hp: 118,
    radius: 36,
    color: "#ff8a4d",
  },
  brine: {
    planetId: "brine",
    kind: "tide",
    name: "Tide Serpent",
    keyId: "brine",
    tankBonus: 18,
    salvage: null,
    hp: 124,
    radius: 38,
    color: "#3ec8c8",
  },
  thorn: {
    planetId: "thorn",
    kind: "bramble",
    name: "Bramble King",
    keyId: "thorn",
    tankBonus: 20,
    salvage: null,
    hp: 130,
    radius: 37,
    color: "#c6e04a",
  },
  helix: {
    planetId: "helix",
    kind: "coil",
    name: "Coil Warden",
    keyId: "helix",
    tankBonus: 22,
    salvage: null,
    hp: 140,
    radius: 42,
    color: "#ff5ec8",
  },
};

export class PlanetBoss {
  def: BossDef;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp: number;
  maxHp: number;
  alive = true;
  flash = 0;
  shots: BossShot[] = [];
  ring = 0;
  private ringLife = 0;
  private t = 0;
  private fireCd = 0.8;
  private specialCd = 1.6;
  private homeX: number;
  private homeY: number;

  constructor(def: BossDef, x: number, y: number) {
    this.def = def;
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.hp = def.hp;
    this.maxHp = def.hp;
  }

  hurt(dmg: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flash = 0.14;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.shots = [];
      this.ring = 0;
      return true;
    }
    return false;
  }

  ringHits(x: number, y: number, r: number): boolean {
    if (this.ring <= 8) return false;
    const d = Math.hypot(x - this.x, y - this.y);
    return Math.abs(d - this.ring) < r + 10;
  }

  update(
    dt: number,
    shipX: number,
    shipY: number,
    cavern: Cavern | null,
    spawnRock: SpawnRockFn,
  ): void {
    if (!this.alive) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    if (this.ringLife > 0) {
      this.ringLife -= dt;
      this.ring += 130 * dt;
    } else {
      this.ring = 0;
    }

    if (this.def.kind === "ember") this.stepEmber(dt, shipX, shipY);
    else if (this.def.kind === "frost") this.stepFrost(dt, shipX, shipY);
    else if (this.def.kind === "spore") this.stepSpore(dt, shipX, shipY, spawnRock);
    else if (this.def.kind === "veil") this.stepVeil(dt, shipX, shipY, cavern);
    else if (this.def.kind === "ash") this.stepAsh(dt, shipX, shipY);
    else if (this.def.kind === "tide") this.stepTide(dt, shipX, shipY);
    else if (this.def.kind === "bramble") this.stepBramble(dt, shipX, shipY, spawnRock);
    else this.stepCoil(dt, shipX, shipY);

    this.vx += (this.homeX - this.x) * 0.35 * dt;
    this.vy += (this.homeY - this.y) * 0.35 * dt;
    this.vx *= Math.max(0, 1 - 1.4 * dt);
    this.vy *= Math.max(0, 1 - 1.4 * dt);

    if (cavern) {
      const moved = moveAgainst(cavern, this.x, this.y, this.vx * dt, this.vy * dt, this.def.radius * 0.7, 0.4);
      this.x = moved.x;
      this.y = moved.y;
      this.vx = moved.hit ? moved.vx / dt : this.vx;
      this.vy = moved.hit ? moved.vy / dt : this.vy;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    const list = this.shots;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const shot = list[i];
      if (!shot) continue;
      shot.life -= dt;
      if (shot.homing) {
        const ang = Math.atan2(shipY - shot.y, shipX - shot.x);
        shot.vx += Math.cos(ang) * 420 * dt;
        shot.vy += Math.sin(ang) * 420 * dt;
        const spd = Math.hypot(shot.vx, shot.vy);
        if (spd > 280) {
          shot.vx = (shot.vx / spd) * 280;
          shot.vy = (shot.vy / spd) * 280;
        }
      }
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (shot.life <= 0) continue;
      if (cavern && circleHitsSolid(cavern, shot.x, shot.y, shot.radius)) continue;
      list[w++] = shot;
    }
    list.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    if (!this.alive) return;
    for (const shot of this.shots) {
      ctx.fillStyle = shot.color;
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.ring > 8) {
      ctx.save();
      ctx.strokeStyle = "rgba(154, 216, 255, 0.7)";
      ctx.lineWidth = Math.max(2, 4 / zoom);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 1 + Math.sin(this.t * 4) * 0.04;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = this.flash > 0 ? "#fff6e8" : "#0b0c10";
    ctx.strokeStyle = this.def.color;
    ctx.lineWidth = Math.max(2, 2.4 / zoom);
    this.drawBody(ctx);
    ctx.restore();

    const barW = 56;
    const ratio = this.hp / this.maxHp;
    ctx.fillStyle = "rgba(8, 10, 16, 0.75)";
    ctx.fillRect(this.x - barW / 2, this.y - this.def.radius - 16, barW, 5);
    ctx.fillStyle = this.def.color;
    ctx.fillRect(this.x - barW / 2, this.y - this.def.radius - 16, barW * ratio, 5);
  }

  private drawBody(ctx: CanvasRenderingContext2D): void {
    const r = this.def.radius;
    ctx.beginPath();
    if (this.def.kind === "ember") {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + this.t * 0.4;
        const rad = i % 2 === 0 ? r : r * 0.62;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else if (this.def.kind === "frost") {
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.7, -r * 0.15);
      ctx.lineTo(r * 0.55, r * 0.75);
      ctx.lineTo(-r * 0.55, r * 0.75);
      ctx.lineTo(-r * 0.7, -r * 0.15);
    } else if (this.def.kind === "spore") {
      ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    } else if (this.def.kind === "veil") {
      ctx.arc(0, 0, r * 0.7, 0.35, Math.PI * 2 - 0.35);
      ctx.arc(r * 0.15, 0, r * 0.42, Math.PI * 0.7, -Math.PI * 0.7, true);
    } else if (this.def.kind === "ash") {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + this.t * 0.25;
        const rad = i % 2 === 0 ? r : r * 0.5;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else if (this.def.kind === "tide") {
      ctx.moveTo(-r * 0.9, 0);
      ctx.quadraticCurveTo(-r * 0.3, -r, r * 0.2, -r * 0.2);
      ctx.quadraticCurveTo(r * 0.7, r * 0.15, r, 0);
      ctx.quadraticCurveTo(r * 0.7, -r * 0.1, r * 0.2, r * 0.25);
      ctx.quadraticCurveTo(-r * 0.3, r, -r * 0.9, 0);
    } else if (this.def.kind === "bramble") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        ctx.lineTo(Math.cos(a + 0.22) * r * 0.42, Math.sin(a + 0.22) * r * 0.42);
      }
    } else {
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.moveTo(r * 0.2, 0);
      ctx.arc(0, 0, r * 0.88, 0.15, Math.PI * 1.7);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private stepEmber(dt: number, shipX: number, shipY: number): void {
    if (this.fireCd <= 0) {
      this.fireCd = 1.35;
      this.radial(8, 210, 2.1, this.def.color);
    }
    if (this.specialCd <= 0) {
      this.specialCd = 2.8;
      const ang = Math.atan2(shipY - this.y, shipX - this.x);
      this.vx += Math.cos(ang) * 280;
      this.vy += Math.sin(ang) * 280;
    }
    this.vx += Math.cos(this.t * 1.3) * 18 * dt;
  }

  private stepFrost(_dt: number, shipX: number, shipY: number): void {
    if (this.fireCd <= 0) {
      this.fireCd = 1.05;
      const base = Math.atan2(shipY - this.y, shipX - this.x);
      for (const off of [-0.18, 0, 0.18]) {
        this.shot(base + off, 260, 2.4, 4, this.def.color, false);
      }
    }
    if (this.specialCd <= 0) {
      this.specialCd = 3.1;
      this.ring = 18;
      this.ringLife = 0.7;
    }
  }

  private stepSpore(_dt: number, _shipX: number, _shipY: number, spawnRock: SpawnRockFn): void {
    if (this.fireCd <= 0) {
      this.fireCd = 1.7;
      this.radial(10, 170, 1.8, this.def.color);
    }
    if (this.specialCd <= 0) {
      this.specialCd = 2.5;
      const a = Math.random() * Math.PI * 2;
      spawnRock(this.x + Math.cos(a) * 70, this.y + Math.sin(a) * 70, 1);
    }
  }

  private stepVeil(_dt: number, shipX: number, shipY: number, cavern: Cavern | null): void {
    if (this.fireCd <= 0) {
      this.fireCd = 0.95;
      const a = Math.atan2(shipY - this.y, shipX - this.x);
      this.shot(a, 180, 3.2, 5, "#c9a6ff", true);
    }
    if (this.specialCd <= 0) {
      this.specialCd = 2.6;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const dist = 40 + Math.random() * 90;
        const nx = this.homeX + Math.cos(a) * dist;
        const ny = this.homeY + Math.sin(a) * dist;
        if (!cavern || !circleHitsSolid(cavern, nx, ny, this.def.radius)) {
          this.x = nx;
          this.y = ny;
          this.vx = 0;
          this.vy = 0;
          break;
        }
      }
    }
  }

  private stepAsh(_dt: number, shipX: number, shipY: number): void {
    if (this.fireCd <= 0) {
      this.fireCd = 1.2;
      this.radial(6, 200, 2.2, this.def.color);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * 0.5 + (i - 1.5) * 0.28;
        this.shot(a, 150 + i * 18, 2.4, 3.2, "#ffb36b", false);
      }
    }
    if (this.specialCd <= 0) {
      this.specialCd = 2.9;
      const ang = Math.atan2(shipY - this.y, shipX - this.x);
      this.vx += Math.cos(ang) * 240;
      this.vy += Math.sin(ang) * 240;
    }
  }

  private stepTide(_dt: number, shipX: number, shipY: number): void {
    if (this.fireCd <= 0) {
      this.fireCd = 0.88;
      const base = Math.atan2(shipY - this.y, shipX - this.x);
      const sweep = Math.sin(this.t * 2.2) * 0.55;
      for (let i = -2; i <= 2; i++) {
        this.shot(base + sweep + i * 0.2, 230, 2.3, 3.6, this.def.color, false);
      }
    }
    if (this.specialCd <= 0) {
      this.specialCd = 2.7;
      const base = Math.atan2(shipY - this.y, shipX - this.x);
      for (const side of [-1, 1]) {
        this.shot(base + side * 1.15, 190, 2.6, 5, "#9ad8ff", false);
      }
    }
    this.vx += Math.sin(this.t * 1.6) * 28;
    this.vy += Math.cos(this.t * 1.1) * 18;
  }

  private stepBramble(_dt: number, shipX: number, shipY: number, spawnRock: SpawnRockFn): void {
    if (this.fireCd <= 0) {
      this.fireCd = 1.15;
      const a = Math.atan2(shipY - this.y, shipX - this.x);
      for (const off of [-0.12, 0, 0.12]) {
        this.shot(a + off, 240, 2.1, 3.4, this.def.color, false);
      }
    }
    if (this.specialCd <= 0) {
      this.specialCd = 2.8;
      this.radial(7, 160, 1.9, "#c6e04a");
      const a = Math.random() * Math.PI * 2;
      spawnRock(this.x + Math.cos(a) * 64, this.y + Math.sin(a) * 64, 1);
    }
  }

  private stepCoil(_dt: number, shipX: number, shipY: number): void {
    if (this.fireCd <= 0) {
      this.fireCd = 0.42;
      const a = this.t * 5.4;
      this.shot(a, 220, 2.4, 3.2, this.def.color, false);
      this.shot(a + Math.PI, 220, 2.4, 3.2, "#ffb6e4", false);
    }
    if (this.specialCd <= 0) {
      this.specialCd = 2.4;
      const a = Math.atan2(shipY - this.y, shipX - this.x);
      this.shot(a, 200, 3.0, 5, "#ffe08a", true);
      this.vx += Math.cos(a + Math.PI / 2) * 220;
      this.vy += Math.sin(a + Math.PI / 2) * 220;
    }
  }

  private radial(n: number, speed: number, life: number, color: string): void {
    for (let i = 0; i < n; i++) {
      this.shot((i / n) * Math.PI * 2, speed, life, 3.4, color, false);
    }
  }

  private shot(
    angle: number,
    speed: number,
    life: number,
    radius: number,
    color: string,
    homing: boolean,
  ): void {
    this.shots.push({
      x: this.x + Math.cos(angle) * (this.def.radius + 6),
      y: this.y + Math.sin(angle) * (this.def.radius + 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      radius,
      color,
      homing,
    });
  }
}
