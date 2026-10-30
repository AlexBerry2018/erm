// Геометрия доски: стены, «гвоздики» обоев, перегородки лунок, коллайдеры объектов, проверка раскладки.
import type { Shape } from '../physics/physics';
import { AREA, BoardObject, DEFS, GAP, H, HOLE_TOP, HOLE_W, HOLES, W, bounds } from './defs';
import type { Rng } from '../run/rng';

export type ColliderTag = 'wall' | 'peg' | 'sep' | 'obj';

export interface Collider {
  id: number;
  tag: ColliderTag;
  shape: Shape;
  e: number; // упругость
  obj?: BoardObject;
  sensor?: boolean; // не отталкивает (корзина)
}

export interface Peg {
  x: number;
  y: number;
}

const PEG_R = 3;

/** Сетка гвоздиков-обоев. Под объектами гвоздиков нет. */
export function pegGrid(): Peg[] {
  const out: Peg[] = [];
  const rows = [74, 112, 150, 188, 226, 262];
  rows.forEach((y, i) => {
    const off = i % 2 ? 24 : 0;
    for (let x = 24 + off; x <= W - 20; x += 48) out.push({ x, y });
  });
  return out;
}
const PEGS = pegGrid();

function nearRect(px: number, py: number, b: { x: number; y: number; w: number; h: number }, m: number): boolean {
  return px > b.x - m && px < b.x + b.w + m && py > b.y - m && py < b.y + b.h + m;
}

export function activePegs(objs: BoardObject[]): Peg[] {
  return PEGS.filter((p) => !objs.some((o) => nearRect(p.x, p.y, bounds(o), 12)));
}

/** Все неподвижные коллайдеры доски. Идентификаторы стабильны внутри одного броска. */
export function buildColliders(objs: BoardObject[]): Collider[] {
  const out: Collider[] = [];
  let id = 1;
  out.push({ id: id++, tag: 'wall', shape: { kind: 'rect', x: -40, y: -400, w: 40, h: H + 440 }, e: 0.5 });
  out.push({ id: id++, tag: 'wall', shape: { kind: 'rect', x: W, y: -400, w: 40, h: H + 440 }, e: 0.5 });
  for (let i = 1; i < HOLES.length; i++) {
    const x = i * HOLE_W;
    out.push({ id: id++, tag: 'sep', shape: { kind: 'rect', x: x - 2, y: HOLE_TOP, w: 4, h: H - HOLE_TOP + 20 }, e: 0.4 });
    out.push({ id: id++, tag: 'sep', shape: { kind: 'circle', x, y: HOLE_TOP, r: 3 }, e: 0.5 });
  }
  for (const p of activePegs(objs)) {
    out.push({ id: id++, tag: 'peg', shape: { kind: 'circle', x: p.x, y: p.y, r: PEG_R }, e: 0.5 });
  }
  for (const o of objs) {
    const d = DEFS[o.type];
    const shape: Shape = d.shape === 'win'
      ? { kind: 'rect', x: o.x, y: o.y, w: d.w, h: d.h }
      : { kind: 'circle', x: o.x, y: o.y, r: d.r };
    out.push({ id: 1000 + o.id, tag: 'obj', shape, e: d.restitution, obj: o, sensor: o.type === 'trash' });
  }
  return out;
}

export function holeAt(x: number): number {
  return Math.max(0, Math.min(HOLES.length - 1, Math.floor(x / HOLE_W)));
}

/** Можно ли поставить объект сюда: внутри зоны и не впритык к другим. */
export function fits(o: BoardObject, objs: BoardObject[]): boolean {
  const b = bounds(o);
  if (b.x < AREA.x0 || b.y < AREA.y0 || b.x + b.w > AREA.x1 || b.y + b.h > AREA.y1) return false;
  for (const other of objs) {
    if (other.id === o.id) continue;
    const c = bounds(other);
    if (b.x < c.x + c.w + GAP && b.x + b.w + GAP > c.x && b.y < c.y + c.h + GAP && b.y + b.h + GAP > c.y) return false;
  }
  return true;
}

/** Подгоняет координаты так, чтобы объект не вылезал за зону. */
export function clampToArea(o: BoardObject): void {
  const d = DEFS[o.type];
  if (d.shape === 'win') {
    o.x = Math.max(AREA.x0, Math.min(AREA.x1 - d.w, o.x));
    o.y = Math.max(AREA.y0, Math.min(AREA.y1 - d.h, o.y));
  } else {
    o.x = Math.max(AREA.x0 + d.r, Math.min(AREA.x1 - d.r, o.x));
    o.y = Math.max(AREA.y0 + d.r, Math.min(AREA.y1 - d.r, o.y));
  }
}

/** Ищет свободное место для нового объекта. false — места нет. */
export function findSpot(o: BoardObject, objs: BoardObject[], rng: Rng): boolean {
  for (let k = 0; k < 200; k++) {
    o.x = Math.round(rng.range(AREA.x0, AREA.x1));
    o.y = Math.round(rng.range(AREA.y0, AREA.y1));
    clampToArea(o);
    if (fits(o, objs)) return true;
  }
  return false;
}
