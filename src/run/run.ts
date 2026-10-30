// Забег: раунды, пороги, броски, выбор 1 из 3, раскладка. Чистая логика без DOM.
import { BoardObject, DEFS, ObjType, Rarity } from '../board/defs';
import { findSpot, fits } from '../board/board';
import { Rng, stream } from './rng';
import { CAT_MAX, CatState, ThrowResult, ThrowSim, fixCat } from './throw';

export const ROUNDS = 4;
export const THROWS = 5;
export const TARGETS = [50, 130, 300, 700]; // подобраны ботом: см. npm run sim
export const BOSS_ROUNDS = [4];
export const BONUS_PER_THROW = 5; // донатов за каждый неиспользованный бросок
export const REROLL_BASE = 5;

export type Phase = 'aim' | 'throw' | 'offer' | 'layout' | 'over' | 'won';

export type Offer =
  | { kind: 'new'; type: ObjType; lvl: number; rarity: Rarity }
  | { kind: 'up'; objId: number; type: ObjType; lvl: number; rarity: Rarity }
  | { kind: 'catnip'; rarity: Rarity };

export interface Run {
  seed: string;
  round: number;
  throwNo: number;
  throwsLeft: number;
  roundViewers: number;
  donats: number;
  catCharge: number;
  cat: CatState;
  objs: BoardObject[];
  nextId: number;
  offers: Offer[];
  rerollCost: number;
  phase: Phase;
  peak: number;
  total: number;
  bestThrow: number;
  jackpots: number;
  offerRng: Rng;
}

export function target(round: number): number {
  return TARGETS[Math.min(round, TARGETS.length) - 1];
}

export function isBoss(round: number): boolean {
  return BOSS_ROUNDS.includes(round);
}

export function newRun(seed: string): Run {
  const objs: BoardObject[] = [{ id: 1, type: 'notepad', x: 184, y: 128, lvl: 1 }];
  const run: Run = {
    seed, round: 1, throwNo: 0, throwsLeft: THROWS, roundViewers: 0, donats: 0, catCharge: 0,
    cat: { winId: 1, u: 0.3, dir: 1, timer: 300 }, objs, nextId: 2, offers: [], rerollCost: REROLL_BASE,
    phase: 'aim', peak: 0, total: 0, bestThrow: 0, jackpots: 0, offerRng: stream(seed, 'offers'),
  };
  return run;
}

export function beginThrow(run: Run, aimX: number): ThrowSim {
  run.phase = 'throw';
  return new ThrowSim({
    objs: run.objs,
    aimX,
    rng: stream(run.seed, `throw:${run.round}:${run.throwNo}`),
    cat: run.cat,
    catCharge: run.catCharge,
    boss: isBoss(run.round),
  });
}

export interface ThrowEnd {
  res: ThrowResult;
  cleared: boolean;
  failed: boolean;
  won: boolean;
  bonus: number;
  record: boolean;
}

export function endThrow(run: Run, sim: ThrowSim): ThrowEnd {
  const res = sim.result();
  run.roundViewers += res.score;
  run.total += res.score;
  run.donats += res.donats;
  run.catCharge = sim.catCharge;
  run.cat = { ...sim.cat };
  run.throwsLeft--;
  run.throwNo++;
  if (res.jackpot) run.jackpots++;
  const record = res.score > run.bestThrow && run.bestThrow > 0;
  run.bestThrow = Math.max(run.bestThrow, res.score);
  run.peak = Math.max(run.peak, run.roundViewers);
  const out: ThrowEnd = { res, cleared: false, failed: false, won: false, bonus: 0, record };
  if (run.roundViewers >= target(run.round)) {
    out.cleared = true;
    out.bonus = run.throwsLeft * BONUS_PER_THROW;
    run.donats += out.bonus;
    if (run.round >= ROUNDS) {
      out.won = true;
      run.phase = 'won';
    } else {
      run.phase = 'offer';
      run.rerollCost = REROLL_BASE;
      run.offers = makeOffers(run);
    }
  } else if (run.throwsLeft <= 0) {
    out.failed = true;
    run.phase = 'over';
  } else {
    run.phase = 'aim';
  }
  return out;
}

/** Три разных предложения. Редкость влияет на вес. */
export function makeOffers(run: Run): Offer[] {
  const rng = run.offerRng;
  const pool: { o: Offer; w: number }[] = [];
  const W_BY_RARITY = [10, 6, 3, 1];
  for (const type of Object.keys(DEFS) as ObjType[]) {
    const r = DEFS[type].rarity;
    pool.push({ o: { kind: 'new', type, lvl: 1, rarity: r }, w: W_BY_RARITY[r] });
  }
  for (const o of run.objs) {
    if (o.lvl >= 3) continue;
    const r = (o.lvl === 1 ? 1 : 2) as Rarity;
    pool.push({ o: { kind: 'up', objId: o.id, type: o.type, lvl: o.lvl + 1, rarity: r }, w: W_BY_RARITY[r] * 0.8 });
  }
  const out: Offer[] = [];
  const key = (o: Offer) => (o.kind === 'new' ? 'n' + o.type : o.kind === 'up' ? 'u' + o.objId : 'c');
  while (out.length < 3 && pool.length) {
    // легендарка: редкий шанс на слот
    if (rng.next() < 0.05) {
      const leg: Offer = rng.next() < 0.5
        ? { kind: 'catnip', rarity: 3 }
        : { kind: 'new', type: rng.pick(Object.keys(DEFS) as ObjType[]), lvl: 2, rarity: 3 };
      if (!out.some((o) => key(o) === key(leg))) {
        out.push(leg);
        continue;
      }
    }
    const sum = pool.reduce((a, p) => a + p.w, 0);
    let x = rng.next() * sum;
    let i = 0;
    while (i < pool.length - 1 && (x -= pool[i].w) > 0) i++;
    const pick = pool.splice(i, 1)[0].o;
    if (!out.some((o) => key(o) === key(pick))) out.push(pick);
  }
  return out;
}

export function reroll(run: Run): boolean {
  if (run.phase !== 'offer' || run.donats < run.rerollCost) return false;
  run.donats -= run.rerollCost;
  run.rerollCost += REROLL_BASE;
  run.offers = makeOffers(run);
  return true;
}

/** Применить выбор. Возвращает id нового/улучшенного объекта (для подсветки). */
export function pickOffer(run: Run, i: number): number | null {
  const o = run.offers[i];
  if (!o || run.phase !== 'offer') return null;
  let id: number | null = null;
  if (o.kind === 'new') {
    const obj: BoardObject = { id: run.nextId++, type: o.type, x: 0, y: 0, lvl: o.lvl };
    const rng = stream(run.seed, `place:${run.round}`);
    if (findSpot(obj, run.objs, rng)) {
      run.objs.push(obj);
      id = obj.id;
    } else {
      // места нет — улучшаем случайный объект того же типа или любой
      const t = run.objs.find((x) => x.type === o.type && x.lvl < 3) ?? run.objs.find((x) => x.lvl < 3);
      if (t) { t.lvl++; id = t.id; }
    }
  } else if (o.kind === 'up') {
    const t = run.objs.find((x) => x.id === o.objId);
    if (t) { t.lvl = Math.max(t.lvl, o.lvl); id = t.id; }
  } else {
    run.catCharge = CAT_MAX;
  }
  fixCat(run.cat, run.objs);
  run.offers = [];
  run.phase = 'layout';
  return id;
}

/** Перетаскивание в режиме раскладки. false — так поставить нельзя. */
export function moveObj(run: Run, id: number, x: number, y: number): boolean {
  const o = run.objs.find((q) => q.id === id);
  if (!o || run.phase !== 'layout') return false;
  const probe = { ...o, x, y };
  if (!fits(probe, run.objs)) return false;
  o.x = x;
  o.y = y;
  return true;
}

export function nextRound(run: Run): void {
  if (run.phase !== 'layout') return;
  run.round++;
  run.throwNo = 0;
  run.throwsLeft = THROWS;
  run.roundViewers = 0;
  run.phase = 'aim';
}

/** Слава ✦ за забег (мета будет позже, пока только показываем). */
export function fame(run: Run): number {
  const reached = run.phase === 'won' ? ROUNDS + 1 : run.round;
  return reached * 10 + Math.floor(Math.sqrt(run.peak));
}
