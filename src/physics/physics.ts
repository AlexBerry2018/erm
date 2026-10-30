// Простая детерминированная физика: круги (монетки) против прямоугольников и кругов.
// Шаг фиксированный, монетки друг с другом не сталкиваются — так проще и предсказуемее.

export const TICK = 1 / 120; // секунд в тике
export const SUBSTEPS = 2;
export const GRAVITY = 560;
export const MAX_SPEED = 620;

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number };

export interface Contact {
  nx: number;
  ny: number;
  depth: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Пересечение круга с фигурой: нормаль от фигуры к центру круга и глубина. */
export function contact(b: Body, s: Shape): Contact | null {
  if (s.kind === 'circle') {
    const dx = b.x - s.x;
    const dy = b.y - s.y;
    const rr = b.r + s.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2);
    if (d < 1e-6) return { nx: 0, ny: -1, depth: rr };
    return { nx: dx / d, ny: dy / d, depth: rr - d };
  }
  const cx = Math.max(s.x, Math.min(b.x, s.x + s.w));
  const cy = Math.max(s.y, Math.min(b.y, s.y + s.h));
  const dx = b.x - cx;
  const dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 1e-9) {
    if (d2 >= b.r * b.r) return null;
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: b.r - d };
  }
  // центр внутри прямоугольника — выталкиваем по кратчайшей оси
  const l = b.x - s.x;
  const r = s.x + s.w - b.x;
  const t = b.y - s.y;
  const bt = s.y + s.h - b.y;
  const m = Math.min(l, r, t, bt);
  if (m === t) return { nx: 0, ny: -1, depth: t + b.r };
  if (m === bt) return { nx: 0, ny: 1, depth: bt + b.r };
  if (m === l) return { nx: -1, ny: 0, depth: l + b.r };
  return { nx: 1, ny: 0, depth: r + b.r };
}

/** Разводит тела и отражает скорость. Возвращает скорость удара по нормали (0 — касание без удара). */
export function resolve(b: Body, c: Contact, restitution: number): number {
  b.x += c.nx * c.depth;
  b.y += c.ny * c.depth;
  const vn = b.vx * c.nx + b.vy * c.ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + restitution) * vn * c.nx;
  b.vy -= (1 + restitution) * vn * c.ny;
  // лёгкое трение по касательной
  const tx = -c.ny;
  const ty = c.nx;
  const vt = b.vx * tx + b.vy * ty;
  b.vx -= 0.03 * vt * tx;
  b.vy -= 0.03 * vt * ty;
  return -vn;
}

export function integrate(b: Body, dt: number): void {
  b.vy += GRAVITY * dt;
  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 > MAX_SPEED * MAX_SPEED) {
    const k = MAX_SPEED / Math.sqrt(sp2);
    b.vx *= k;
    b.vy *= k;
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}
