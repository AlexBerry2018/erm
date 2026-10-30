// Один бросок: монетки, касания, лунки. Без DOM — тот же код крутят бот и игра.
import { Body, SUBSTEPS, TICK, contact, integrate, resolve } from '../physics/physics';
import { Collider, buildColliders, holeAt } from '../board/board';
import {
  BoardObject, DEFS, ERROR_MINIS, FLOPPY_USES, H, HOLES, HoleKind, NOTEPAD_VIEWERS, PAINT_TOUCHES,
  TRASH_DONATS, W,
} from '../board/defs';
import type { Rng } from './rng';

export const CAT_MAX = 6; // касаний кота до полной шкалы
export const CAT_R = 10;
const COIN_R = 6;
const MINI_R = 4;
const MAX_COINS = 70;
const MAX_TICKS = 120 * 30;
const COOLDOWN = 12; // тиков между срабатываниями одного объекта на одной монетке
const JACKPOT_COINS = 26;

export type CoinKind = 'main' | 'split' | 'mini' | 'cat';

export interface Coin extends Body {
  id: number;
  kind: CoinKind;
  alive: boolean;
  paint: number; // сколько касаний ещё ×2
  hated: boolean; // задета хейтом: множители лунок не работают
  still: number;
  touched: Map<number, number>; // id коллайдера → тик последнего касания
}

/** Кот живёт на верхней рамке окна. Состояние переживает броски. */
export interface CatState {
  winId: number;
  u: number; // 0..1 вдоль рамки
  dir: number;
  timer: number; // тиков до прыжка на другое окно
}

export interface Hate {
  id: number;
  x: number;
  y: number;
  r: number;
  ph: number;
  alive: boolean;
}

export type TouchWhat = 'peg' | 'notepad' | 'paint' | 'floppy' | 'trash' | 'error' | 'cat' | 'hate';

export type SimEvent =
  | { t: 'touch'; what: TouchWhat; x: number; y: number; gain: number; chain: number; painted: boolean; objId?: number }
  | { t: 'hole'; hole: number; kind: HoleKind; x: number; y: number; gain: number; factor: number; hated: boolean; coinKind: CoinKind }
  | { t: 'split'; x: number; y: number }
  | { t: 'explode'; x: number; y: number; n: number; objId: number }
  | { t: 'catCharge'; charge: number }
  | { t: 'jackpot'; x: number; y: number }
  | { t: 'done' };

export interface ThrowResult {
  viewers: number;
  mult: number;
  score: number;
  donats: number;
  touches: number;
  jackpot: boolean;
}

export interface ThrowInit {
  objs: BoardObject[];
  aimX: number;
  rng: Rng;
  cat: CatState;
  catCharge: number;
  boss: boolean;
}

export function catPos(cat: CatState, objs: BoardObject[]): { x: number; y: number } | null {
  const w = objs.find((o) => o.id === cat.winId && DEFS[o.type].shape === 'win');
  if (!w) return null;
  const d = DEFS[w.type];
  return { x: w.x + 10 + cat.u * (d.w - 20), y: w.y - CAT_R + 1 };
}

/** Если окно кота пропало — пересаживаем на первое попавшееся окно. */
export function fixCat(cat: CatState, objs: BoardObject[]): void {
  if (catPos(cat, objs)) return;
  const w = objs.find((o) => DEFS[o.type].shape === 'win');
  cat.winId = w ? w.id : -1;
  cat.u = 0.5;
}

export class ThrowSim {
  tick = 0;
  coins: Coin[] = [];
  hates: Hate[] = [];
  viewers = 0;
  mult = 1;
  chain = 0;
  donatShare = 0;
  flatDonats = 0;
  catCharge: number;
  cat: CatState;
  jackpot = false;
  done = false;
  events: SimEvent[] = [];
  brokenErrors = new Set<number>();
  private floppyUses = new Map<number, number>();
  private colliders: Collider[];
  private rng: Rng;
  private objs: BoardObject[];
  private nextCoin = 1;

  constructor(init: ThrowInit) {
    this.objs = init.objs;
    this.rng = init.rng;
    this.cat = { ...init.cat };
    this.catCharge = init.catCharge;
    this.colliders = buildColliders(init.objs);
    fixCat(this.cat, this.objs);
    this.addCoin('main', init.aimX, 0, this.rng.range(-14, 14), 30, COIN_R);
    if (init.boss) {
      for (let i = 0; i < 4; i++) {
        this.hates.push({
          id: i, x: this.rng.range(40, W - 40), y: this.rng.range(30, 170), r: 11, ph: this.rng.range(0, 6.28), alive: true,
        });
      }
    }
  }

  private addCoin(kind: CoinKind, x: number, y: number, vx: number, vy: number, r: number): Coin | null {
    if (this.coins.filter((c) => c.alive).length >= MAX_COINS) return null;
    const c: Coin = { id: this.nextCoin++, kind, x, y, vx, vy, r, alive: true, paint: 0, hated: false, still: 0, touched: new Map() };
    this.coins.push(c);
    return c;
  }

  private ready(c: Coin, key: number): boolean {
    const last = c.touched.get(key);
    if (last !== undefined && this.tick - last < COOLDOWN) {
      c.touched.set(key, this.tick);
      return false;
    }
    c.touched.set(key, this.tick);
    return true;
  }

  private gain(c: Coin, what: TouchWhat, base: number, x: number, y: number, objId?: number): void {
    let g = base;
    const painted = c.paint > 0 && what !== 'paint' && base > 0;
    if (painted) {
      g *= 2;
      c.paint--;
    }
    this.viewers += g;
    this.chain++;
    this.events.push({ t: 'touch', what, x, y, gain: g, chain: this.chain, painted, objId });
  }

  step(): void {
    if (this.done) return;
    this.tick++;
    const dt = TICK / SUBSTEPS;
    this.moveCat();
    for (const h of this.hates) {
      if (!h.alive) continue;
      h.y += 14 * TICK;
      h.x += Math.sin(this.tick * 0.03 + h.ph) * 0.25;
      if (h.y > H - 40) h.alive = false;
    }
    const cp = catPos(this.cat, this.objs);
    for (let s = 0; s < SUBSTEPS; s++) {
      for (let i = 0; i < this.coins.length; i++) {
        const c = this.coins[i];
        if (!c.alive) continue;
        integrate(c, dt);
        this.collide(c, cp);
        if (c.alive && c.y > H - 6) this.land(c);
      }
    }
    for (const c of this.coins) {
      if (!c.alive) continue;
      // застряла на ровной рамке — подтолкнём
      if (c.vx * c.vx + c.vy * c.vy < 30 * 30) c.still++;
      else c.still = 0;
      if (c.still > 50) {
        c.vx = (this.rng.next() < 0.5 ? -1 : 1) * this.rng.range(80, 140);
        c.vy = -110;
        c.still = 0;
      }
    }
    if (this.tick >= MAX_TICKS) for (const c of this.coins) c.alive = false;
    if (this.tick > 1 && !this.coins.some((c) => c.alive)) {
      this.done = true;
      this.events.push({ t: 'done' });
    }
  }

  private moveCat(): void {
    const cat = this.cat;
    const win = this.objs.find((o) => o.id === cat.winId);
    if (!win) return;
    const len = DEFS[win.type].w - 20;
    cat.u += (cat.dir * 26 * TICK) / len;
    if (cat.u > 1) { cat.u = 1; cat.dir = -1; }
    if (cat.u < 0) { cat.u = 0; cat.dir = 1; }
    if (--cat.timer <= 0) {
      const wins = this.objs.filter((o) => DEFS[o.type].shape === 'win');
      cat.winId = this.rng.pick(wins).id;
      cat.u = this.rng.next();
      cat.timer = Math.floor(this.rng.range(240, 480));
    }
  }

  private collide(c: Coin, cp: { x: number; y: number } | null): void {
    for (const col of this.colliders) {
      const s = col.shape;
      // быстрое отсечение
      if (s.kind === 'circle') {
        if (Math.abs(c.x - s.x) > s.r + c.r || Math.abs(c.y - s.y) > s.r + c.r) continue;
      } else if (c.x + c.r < s.x || c.x - c.r > s.x + s.w || c.y + c.r < s.y || c.y - c.r > s.y + s.h) continue;
      const k = contact(c, s);
      if (!k) continue;
      if (col.obj?.type === 'trash') {
        this.eat(c, col);
        return;
      }
      if (col.obj?.type === 'error' && this.brokenErrors.has(col.obj.id)) {
        resolve(c, k, 0.3);
        continue;
      }
      const hit = resolve(c, k, col.e);
      if (hit > 60) c.vx += this.rng.range(-9, 9);
      if (col.tag === 'wall' || col.tag === 'sep') continue;
      if (!this.ready(c, col.id)) continue;
      if (col.tag === 'peg') this.gain(c, 'peg', 1, s.kind === 'circle' ? s.x : c.x, c.y);
      else if (col.obj) this.touchObj(c, col.obj, col.id);
    }
    if (cp) {
      const k = contact(c, { kind: 'circle', x: cp.x, y: cp.y, r: CAT_R });
      if (k) {
        resolve(c, k, 0.5);
        if (this.ready(c, -1)) {
          // кот отбивает лапой куда хочет
          const a = this.rng.range(-2.6, -0.55);
          const sp = this.rng.range(280, 360);
          c.vx = Math.cos(a) * sp;
          c.vy = Math.sin(a) * sp;
          this.catCharge = Math.min(CAT_MAX, this.catCharge + 1);
          this.gain(c, 'cat', 3, cp.x, cp.y);
          this.events.push({ t: 'catCharge', charge: this.catCharge });
        }
      }
    }
    for (const h of this.hates) {
      if (!h.alive) continue;
      if (!contact(c, { kind: 'circle', x: h.x, y: h.y, r: h.r })) continue;
      h.alive = false;
      c.hated = true;
      this.mult = 1;
      this.chain++;
      this.events.push({ t: 'touch', what: 'hate', x: h.x, y: h.y, gain: 0, chain: this.chain, painted: false });
    }
  }

  private touchObj(c: Coin, o: BoardObject, colId: number): void {
    const d = DEFS[o.type];
    const cx = d.shape === 'win' ? Math.max(o.x, Math.min(c.x, o.x + d.w)) : o.x;
    const cy = d.shape === 'win' ? Math.max(o.y, Math.min(c.y, o.y + d.h)) : o.y;
    switch (o.type) {
      case 'notepad':
        this.gain(c, 'notepad', NOTEPAD_VIEWERS[o.lvl - 1], cx, cy, o.id);
        break;
      case 'paint':
        this.gain(c, 'paint', 2, cx, cy, o.id);
        c.paint = PAINT_TOUCHES[o.lvl - 1];
        break;
      case 'floppy': {
        this.gain(c, 'floppy', 2, cx, cy, o.id);
        const used = this.floppyUses.get(o.id) ?? 0;
        if (used < FLOPPY_USES[o.lvl - 1]) {
          const kind: CoinKind = c.kind === 'main' ? 'split' : c.kind;
          const n = this.addCoin(kind, c.x, c.y, -c.vx + this.rng.range(-30, 30), c.vy - 40, c.r);
          if (n) {
            this.floppyUses.set(o.id, used + 1);
            n.touched.set(colId, this.tick);
            n.paint = c.paint;
            this.events.push({ t: 'split', x: c.x, y: c.y });
          }
        }
        break;
      }
      case 'error': {
        this.gain(c, 'error', 3, cx, cy, o.id);
        this.brokenErrors.add(o.id);
        const n = ERROR_MINIS[o.lvl - 1];
        const ex = o.x + d.w / 2;
        for (let i = 0; i < n; i++) {
          this.addCoin('mini', ex + this.rng.range(-20, 20), o.y - 8, this.rng.range(-170, 170), this.rng.range(-280, -170), MINI_R);
        }
        this.events.push({ t: 'explode', x: ex, y: o.y + d.h / 2, n, objId: o.id });
        break;
      }
      default:
        break;
    }
  }

  private eat(c: Coin, col: Collider): void {
    const o = col.obj!;
    c.alive = false;
    this.donatShare += TRASH_DONATS[o.lvl - 1];
    this.gain(c, 'trash', 10, o.x, o.y, o.id);
  }

  private land(c: Coin): void {
    c.alive = false;
    const hole = holeAt(c.x);
    const kind = HOLES[hole];
    let gain = 0;
    let factor = 1;
    const strong = c.kind === 'main' || c.kind === 'split';
    if (kind === '+10') {
      gain = 10;
    } else if (kind === '×2' || kind === '×3') {
      const n = kind === '×2' ? 2 : 3;
      factor = c.hated ? 1 : strong ? n : 1 + (n - 1) / 4;
      this.mult *= factor;
    } else if (kind === 'КОТ') {
      if (this.catCharge >= CAT_MAX && !this.jackpot) {
        this.jackpot = true;
        this.catCharge = 0;
        for (let i = 0; i < JACKPOT_COINS; i++) {
          this.addCoin('cat', this.rng.range(12, W - 12), -this.rng.range(10, 260), this.rng.range(-40, 40), this.rng.range(0, 60), COIN_R);
        }
        this.events.push({ t: 'jackpot', x: c.x, y: H - 10 });
        this.events.push({ t: 'catCharge', charge: 0 });
      } else {
        gain = 5;
        if (!this.jackpot) {
          this.catCharge = Math.min(CAT_MAX, this.catCharge + 1);
          this.events.push({ t: 'catCharge', charge: this.catCharge });
        }
      }
    } else {
      this.flatDonats += 3;
    }
    this.viewers += gain;
    this.events.push({ t: 'hole', hole, kind, x: c.x, y: H - 10, gain, factor, hated: c.hated, coinKind: c.kind });
  }

  get score(): number {
    return Math.round(this.viewers * this.mult);
  }

  result(): ThrowResult {
    const score = this.score;
    return {
      viewers: this.viewers,
      mult: this.mult,
      score,
      donats: Math.round((score / 25) * (1 + this.donatShare)) + this.flatDonats,
      touches: this.chain,
      jackpot: this.jackpot,
    };
  }

  /** Прогнать бросок до конца (для бота и тестов). */
  runToEnd(): ThrowResult {
    while (!this.done) {
      this.step();
      this.events.length = 0;
    }
    return this.result();
  }
}

/** Пунктир первых отскоков: только физика, без случайности и эффектов. */
export function previewPath(objs: BoardObject[], aimX: number, bounces = 2): { x: number; y: number }[] {
  const cols = buildColliders(objs);
  const b: Body = { x: aimX, y: 0, vx: 0, vy: 30, r: COIN_R };
  const pts = [{ x: b.x, y: b.y }];
  let hits = 0;
  let after = -1;
  for (let t = 0; t < 400; t++) {
    for (let s = 0; s < SUBSTEPS; s++) {
      integrate(b, TICK / SUBSTEPS);
      for (const col of cols) {
        const k = contact(b, col.shape);
        if (!k) continue;
        if (col.sensor) return pts;
        const v = resolve(b, k, col.e);
        if (v > 40 && col.tag !== 'wall' && after < 0) {
          hits++;
          if (hits >= bounces) after = 14;
        }
      }
    }
    if (t % 2 === 0) pts.push({ x: b.x, y: b.y });
    if (after >= 0 && --after <= 0) break;
    if (b.y > H) break;
  }
  return pts;
}
