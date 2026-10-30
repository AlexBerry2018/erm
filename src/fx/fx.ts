// Ощущения: ASCII-частицы, всплывающие цифры, тряска, хитстоп, вспышки лунок и объектов.
// Только визуал: случайность здесь косметическая и на счёт не влияет.

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const CHARS = ['*', '+', '✦', '◆', '◈', '★', '·'];

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; decay: number; ch: string; c: string; s: number }
export interface Popup { x: number; y: number; text: string; c: string; s: number; life: number }

export class Fx {
  parts: Particle[] = [];
  pops: Popup[] = [];
  shake = 0;
  hitstopUntil = 0;
  holeFlash: number[] = [0, 0, 0, 0, 0, 0];
  objFlash = new Map<number, number>();
  pegFlash: { x: number; y: number; life: number }[] = [];
  catFlash = 0;

  burst(x: number, y: number, n: number, color: string, power = 1): void {
    if (REDUCED) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (40 + Math.random() * 120);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 1, decay: 1.2 + Math.random() * 0.9,
        ch: CHARS[Math.floor(Math.random() * CHARS.length)], c: color, s: 7 + Math.random() * 6,
      });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  pop(x: number, y: number, text: string, c: string, s = 10): void {
    this.pops.push({ x, y, text, c, s, life: 1 });
    if (this.pops.length > 60) this.pops.shift();
  }

  addShake(a: number): void {
    if (REDUCED) return;
    this.shake = Math.min(12, Math.max(this.shake, a));
  }

  hitstop(ms: number): void {
    this.hitstopUntil = Math.max(this.hitstopUntil, performance.now() + ms);
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= p.decay * dt;
      p.vy += 220 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.pops) {
      p.life -= dt * 1.1;
      p.y -= 22 * dt;
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    for (const p of this.pegFlash) p.life -= dt * 3;
    this.pegFlash = this.pegFlash.filter((p) => p.life > 0);
    this.holeFlash = this.holeFlash.map((v) => Math.max(0, v - dt * 2));
    for (const [k, v] of this.objFlash) {
      if (v - dt * 3 <= 0) this.objFlash.delete(k);
      else this.objFlash.set(k, v - dt * 3);
    }
    this.catFlash = Math.max(0, this.catFlash - dt * 2);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  clear(): void {
    this.parts = [];
    this.pops = [];
    this.pegFlash = [];
    this.shake = 0;
  }
}
