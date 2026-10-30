// Объекты рабочего стола: размеры, редкость, числа по уровням.

export const W = 480; // ширина доски в мировых единицах
export const H = 320;
export const HOLE_TOP = H - 30; // верх перегородок лунок
export const DROP_Y = 10;
/** Зона, куда можно ставить объекты (не мешаем прицелу и лункам). */
export const AREA = { x0: 4, y0: 46, x1: W - 4, y1: HOLE_TOP - 22 };
export const GAP = 16; // минимальный зазор между объектами: монетка должна пролезать

export type HoleKind = '+10' | '×2' | '×3' | 'КОТ' | 'КОРЗИНА';
export const HOLES: HoleKind[] = ['+10', '×2', 'КОТ', '×3', '+10', 'КОРЗИНА'];
export const HOLE_W = W / HOLES.length;

export type ObjType = 'notepad' | 'paint' | 'floppy' | 'trash' | 'error';
export type Rarity = 0 | 1 | 2 | 3; // обычный / редкий / эпический / легендарный
export const RARITY_NAMES = ['обычный', 'редкий', 'эпический', 'легендарный'];

export interface BoardObject {
  id: number;
  type: ObjType;
  /** окно: левый верхний угол; иконка: центр */
  x: number;
  y: number;
  lvl: number; // 1..3
}

export interface ObjDef {
  name: string;
  file: string; // подпись в заголовке окна
  shape: 'win' | 'icon';
  w: number;
  h: number;
  r: number;
  rarity: Rarity;
  restitution: number;
  desc: (lvl: number) => string;
}

export const NOTEPAD_VIEWERS = [5, 8, 12];
export const PAINT_TOUCHES = [3, 4, 5];
export const FLOPPY_USES = [2, 3, 4]; // сколько раз за бросок дискета может раздвоить
export const TRASH_DONATS = [0.5, 0.75, 1]; // +доля к донатам броска
export const ERROR_MINIS = [3, 4, 5];

export const DEFS: Record<ObjType, ObjDef> = {
  notepad: {
    name: 'Блокнот', file: 'notepad.exe', shape: 'win', w: 112, h: 56, r: 0, rarity: 0, restitution: 0.55,
    desc: (l) => `+${NOTEPAD_VIEWERS[l - 1]} 👁 за касание`,
  },
  paint: {
    name: 'Paint', file: 'paint.exe', shape: 'win', w: 100, h: 60, r: 0, rarity: 1, restitution: 0.55,
    desc: (l) => `красит монетку: следующие ${PAINT_TOUCHES[l - 1]} касания дают ×2 👁`,
  },
  error: {
    name: 'Окно ошибки', file: 'error.exe', shape: 'win', w: 100, h: 48, r: 0, rarity: 2, restitution: 0.6,
    desc: (l) => `раз за бросок взрывается: ${ERROR_MINIS[l - 1]} мини-монетки`,
  },
  floppy: {
    name: 'Дискета', file: 'A:', shape: 'icon', w: 0, h: 0, r: 13, rarity: 1, restitution: 0.7,
    desc: (l) => `раздваивает монетку (до ${FLOPPY_USES[l - 1]} раз за бросок)`,
  },
  trash: {
    name: 'Корзина', file: 'trash', shape: 'icon', w: 0, h: 0, r: 13, rarity: 0, restitution: 0,
    desc: (l) => `съедает монетку: +${Math.round(TRASH_DONATS[l - 1] * 100)}% донатов броска, +10 👁`,
  },
};

export function bounds(o: BoardObject): { x: number; y: number; w: number; h: number } {
  const d = DEFS[o.type];
  if (d.shape === 'win') return { x: o.x, y: o.y, w: d.w, h: d.h };
  return { x: o.x - d.r, y: o.y - d.r, w: d.r * 2, h: d.r * 2 };
}
