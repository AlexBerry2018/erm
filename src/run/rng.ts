// Сидовый ГСЧ (mulberry32). Состояние — одно число, поэтому его легко сохранить и повторить.
export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  /** [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(a: readonly T[]): T {
    return a[this.int(a.length)];
  }
}

/** FNV-1a: строка → 32-битное число. Нужен, чтобы из сида получать независимые потоки. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Отдельный поток ГСЧ для части забега: сид + метка ('offers', 'throw:2:3' …). */
export function stream(seed: string, label: string): Rng {
  return new Rng(hashStr(seed + '|' + label));
}

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Новый сид для забега. Единственное место, где берём внешнюю случайность. */
export function newSeed(): string {
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => ABC[v % ABC.length]).join('');
}

export function normSeed(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
