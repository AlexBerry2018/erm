// Рисование доски на Canvas 2D: обои, гвоздики, окна Win95, иконки, кот, монетки, лунки, эффекты.
import { AREA, BoardObject, DEFS, H, HOLE_TOP, HOLE_W, HOLES, HoleKind, W } from '../board/defs';
import type { Peg } from '../board/board';
import { CAT_R, CatState, Coin, Hate, catPos } from '../run/throw';
import type { Fx } from '../fx/fx';

export const C = {
  paper: '#fffdf6', paper2: '#fbf8ef', ink: '#0a1f80', blue: '#1f44c8', pink: '#e2245a', gold: '#d98a00',
  green: '#0e9f6e', grey: '#d4d0c8', dim: '#6b7bb8',
};
const MONO = "'IBM Plex Mono', 'Courier New', monospace";
const PIX = "'Press Start 2P', monospace";

export interface View {
  s: number; // масштаб мир → css-пиксели
  ox: number;
  oy: number;
  dpr: number;
}

export interface RenderState {
  objs: BoardObject[];
  pegs: Peg[];
  coins: Coin[];
  hates: Hate[];
  cat: CatState;
  catFull: boolean;
  broken: Set<number>;
  aimX: number | null;
  preview: { x: number; y: number }[] | null;
  layout: { dragId: number | null; invalid: boolean; fresh: number | null } | null;
  time: number;
}

const HOLE_COLOR: Record<HoleKind, string> = { '+10': C.blue, '×2': C.pink, '×3': C.pink, 'КОТ': C.gold, 'КОРЗИНА': C.dim };

export function render(ctx: CanvasRenderingContext2D, v: View, st: RenderState, fx: Fx): void {
  const cw = ctx.canvas.width;
  const chh = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#efe9d6';
  ctx.fillRect(0, 0, cw, chh);
  const sx = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
  const sy = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
  ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * (v.ox + sx), v.dpr * (v.oy + sy));

  drawBg(ctx, st);
  drawHoles(ctx, fx);
  drawPegs(ctx, st.pegs, fx);
  for (const o of st.objs) drawObj(ctx, o, st, fx);
  drawCat(ctx, st, fx);
  for (const h of st.hates) if (h.alive) drawHate(ctx, h, st.time);
  if (st.preview) drawPreview(ctx, st.preview);
  for (const c of st.coins) if (c.alive) drawCoin(ctx, c);
  if (st.aimX !== null) drawAim(ctx, st.aimX, st.time);
  drawFx(ctx, fx);
}

function drawBg(ctx: CanvasRenderingContext2D, st: RenderState): void {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, -40, W, H + 40);
  ctx.fillStyle = 'rgba(31,68,200,.05)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 0.5);
  // зона броска
  ctx.strokeStyle = 'rgba(31,68,200,.25)';
  ctx.setLineDash([3, 4]);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, AREA.y0 - 8);
  ctx.lineTo(W, AREA.y0 - 8);
  ctx.stroke();
  ctx.setLineDash([]);
  if (st.layout) {
    ctx.strokeStyle = 'rgba(226,36,90,.35)';
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(AREA.x0, AREA.y0, AREA.x1 - AREA.x0, AREA.y1 - AREA.y0);
    ctx.setLineDash([]);
  }
}

function drawHoles(ctx: CanvasRenderingContext2D, fx: Fx): void {
  HOLES.forEach((k, i) => {
    const x = i * HOLE_W;
    const col = HOLE_COLOR[k];
    const f = fx.holeFlash[i];
    ctx.globalAlpha = 0.1 + f * 0.5;
    ctx.fillStyle = col;
    ctx.fillRect(x, HOLE_TOP, HOLE_W, H - HOLE_TOP);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.font = `${k === 'КОРЗИНА' ? 7 : 10}px ${PIX}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(k, x + HOLE_W / 2, (HOLE_TOP + H) / 2 + 1);
  });
  ctx.fillStyle = C.blue;
  for (let i = 1; i < HOLES.length; i++) {
    const x = i * HOLE_W;
    ctx.fillRect(x - 2, HOLE_TOP, 4, H - HOLE_TOP);
    ctx.beginPath();
    ctx.arc(x, HOLE_TOP, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, H - 1.5, W, 1.5);
}

function drawPegs(ctx: CanvasRenderingContext2D, pegs: Peg[], fx: Fx): void {
  ctx.fillStyle = C.dim;
  for (const p of pegs) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 3.2);
    ctx.lineTo(p.x + 3.2, p.y);
    ctx.lineTo(p.x, p.y + 3.2);
    ctx.lineTo(p.x - 3.2, p.y);
    ctx.fill();
  }
  for (const f of fx.pegFlash) {
    ctx.globalAlpha = f.life;
    ctx.fillStyle = C.pink;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 3 + (1 - f.life) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function stars(lvl: number): string {
  return '★'.repeat(lvl);
}

function drawObj(ctx: CanvasRenderingContext2D, o: BoardObject, st: RenderState, fx: Fx): void {
  const d = DEFS[o.type];
  const flash = fx.objFlash.get(o.id) ?? 0;
  const broken = st.broken.has(o.id);
  const L = st.layout;
  const drag = L && L.dragId === o.id;
  ctx.save();
  if (flash) {
    const k = 1 + flash * 0.06;
    const cx = d.shape === 'win' ? o.x + d.w / 2 : o.x;
    const cy = d.shape === 'win' ? o.y + d.h / 2 : o.y;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
  }
  if (broken) ctx.globalAlpha = 0.45;
  if (d.shape === 'win') drawWin(ctx, o, broken, flash, st.time);
  else drawIcon(ctx, o, flash);
  ctx.globalAlpha = 1;
  if (L) {
    const b = d.shape === 'win' ? { x: o.x, y: o.y, w: d.w, h: d.h } : { x: o.x - d.r, y: o.y - d.r, w: d.r * 2, h: d.r * 2 };
    ctx.strokeStyle = drag && L.invalid ? C.pink : L.fresh === o.id ? C.gold : C.blue;
    ctx.lineWidth = drag ? 1.6 : 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.setLineDash([]);
    if (L.fresh === o.id) {
      ctx.fillStyle = C.gold;
      ctx.font = `bold 7px ${MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText('НОВОЕ', b.x - 3, b.y - 7);
    }
  }
  ctx.restore();
}

function drawWin(ctx: CanvasRenderingContext2D, o: BoardObject, broken: boolean, flash: number, t: number): void {
  const d = DEFS[o.type];
  const { x, y } = o;
  const w = d.w;
  const h = d.h;
  ctx.fillStyle = C.blue;
  ctx.fillRect(x + 3.5, y + 3.5, w, h);
  ctx.fillStyle = flash ? '#fff3c4' : C.paper2;
  ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, o.type === 'error' ? '#800020' : '#000080');
  g.addColorStop(1, o.type === 'error' ? '#d01048' : '#1084d0');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, 11);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 7px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.file, x + 3, y + 6);
  ctx.fillStyle = '#ffd84a';
  ctx.textAlign = 'right';
  ctx.fillText(stars(o.lvl), x + w - 13, y + 6);
  // кнопка [x]
  ctx.fillStyle = C.grey;
  ctx.fillRect(x + w - 10, y + 2, 8, 7);
  ctx.fillStyle = '#000';
  ctx.font = `bold 6px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText('x', x + w - 6, y + 5.5);
  ctx.strokeStyle = C.blue;
  ctx.lineWidth = 1.6;
  if (broken) ctx.setLineDash([3, 2]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  if (o.type === 'notepad') {
    ctx.fillStyle = C.ink;
    ctx.font = `6.5px ${MONO}`;
    ['привет чат!', 'донаты сюда →', 'TODO: покормить кота'].forEach((s, i) => ctx.fillText(s, x + 4, y + 15 + i * 9));
    if (Math.floor(t * 2) % 2) ctx.fillRect(x + 4 + 6.5 * 0.6 * 20, y + 33, 3, 7);
  } else if (o.type === 'paint') {
    const pal = [C.pink, C.gold, C.green, C.blue, '#8b3fd9', '#000'];
    pal.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(x + 4 + i * 11, y + h - 12, 9, 8);
    });
    ctx.strokeStyle = C.pink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 32);
    ctx.bezierCurveTo(x + 30, y + 14, x + 50, y + 44, x + 88, y + 20);
    ctx.stroke();
  } else if (o.type === 'error') {
    ctx.fillStyle = C.gold;
    ctx.font = `bold 13px ${MONO}`;
    ctx.fillText('⚠', x + 5, y + 15);
    ctx.fillStyle = C.ink;
    ctx.font = `6px ${MONO}`;
    ctx.fillText(broken ? 'ОШИБКА ОШИБКИ' : 'Программа выполнила', x + 22, y + 16);
    ctx.fillText(broken ? '…всё сломано' : 'недопустимую операцию', x + 22, y + 24);
    ctx.fillStyle = C.grey;
    ctx.fillRect(x + w / 2 - 12, y + h - 12, 24, 9);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText('OK', x + w / 2, y + h - 10.5);
  }
}

function drawIcon(ctx: CanvasRenderingContext2D, o: BoardObject, flash: number): void {
  const { x, y } = o;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (o.type === 'floppy') {
    ctx.fillStyle = flash ? C.pink : C.ink;
    ctx.fillRect(x - 10, y - 10, 20, 20);
    ctx.fillStyle = C.grey;
    ctx.fillRect(x - 5, y - 10, 10, 7);
    ctx.fillStyle = C.ink;
    ctx.fillRect(x + 1, y - 9, 2.5, 5);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 7, y + 1, 14, 8);
    ctx.fillStyle = C.ink;
    ctx.font = `bold 6px ${MONO}`;
    ctx.fillText('A:', x, y + 5);
  } else if (o.type === 'trash') {
    ctx.strokeStyle = flash ? C.pink : C.ink;
    ctx.fillStyle = '#e7ecfb';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 7);
    ctx.lineTo(x + 9, y - 7);
    ctx.lineTo(x + 7, y + 11);
    ctx.lineTo(x - 7, y + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(x - 11, y - 11, 22, 3);
    ctx.strokeRect(x - 11, y - 11, 22, 3);
    for (const dx of [-4, 0, 4]) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y - 4);
      ctx.lineTo(x + dx * 0.8, y + 9);
      ctx.stroke();
    }
  }
  const d = DEFS[o.type];
  ctx.fillStyle = C.ink;
  ctx.font = `6px ${MONO}`;
  ctx.fillText(d.name + ' ' + stars(o.lvl), x, y + d.r + 6);
}

const CAT_ART = [' /\\_/\\ ', '( o.o )', ' > ^ < '];
const CAT_FULL = [' /\\_/\\ ', '( ✦.✦ )', ' > ^ < '];

function drawCat(ctx: CanvasRenderingContext2D, st: RenderState, fx: Fx): void {
  const p = catPos(st.cat, st.objs);
  if (!p) return;
  const art = st.catFull ? CAT_FULL : CAT_ART;
  ctx.save();
  if (fx.catFlash) {
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(st.time * 40) * 0.25 * fx.catFlash);
    ctx.translate(-p.x, -p.y);
  }
  ctx.fillStyle = 'rgba(251,248,239,.85)';
  ctx.beginPath();
  ctx.arc(p.x, p.y, CAT_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fx.catFlash ? C.pink : st.catFull ? C.gold : C.ink;
  ctx.font = `bold 6.4px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  art.forEach((s, i) => ctx.fillText(s, p.x, p.y - 6.5 + i * 6.5));
  ctx.restore();
}

function drawHate(ctx: CanvasRenderingContext2D, h: Hate, t: number): void {
  ctx.fillStyle = 'rgba(226,36,90,.12)';
  ctx.strokeStyle = C.pink;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r + Math.sin(t * 4 + h.ph) * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.pink;
  ctx.font = `bold 6px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(['фу', 'кринж', 'скука', 'хейт'][h.id % 4], h.x, h.y);
}

function drawCoin(ctx: CanvasRenderingContext2D, c: Coin): void {
  ctx.fillStyle = c.hated ? '#b9b4a8' : c.kind === 'cat' ? '#ffb347' : '#ffcf3a';
  ctx.strokeStyle = c.paint > 0 ? C.pink : C.gold;
  ctx.lineWidth = c.paint > 0 ? 2 : 1.2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (c.r >= 5) {
    ctx.fillStyle = c.hated ? '#555' : '#9a5a00';
    ctx.font = `bold ${c.r * 1.3}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.hated ? '✕' : '◈', c.x, c.y + 0.5);
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  ctx.fillStyle = 'rgba(31,68,200,.55)';
  for (let i = 1; i < pts.length; i += 2) {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAim(ctx: CanvasRenderingContext2D, x: number, t: number): void {
  const bob = Math.sin(t * 5) * 1.5;
  ctx.strokeStyle = C.pink;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, AREA.y0 - 8);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.pink;
  ctx.font = `bold 8px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▼', x, 14 + bob);
  drawCoin(ctx, { x, y: 4 + bob, r: 6, kind: 'main', paint: 0, hated: false } as Coin);
}

function drawFx(ctx: CanvasRenderingContext2D, fx: Fx): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of fx.parts) {
    ctx.globalAlpha = Math.min(1, p.life * 1.5);
    ctx.fillStyle = p.c;
    ctx.font = `bold ${p.s}px ${MONO}`;
    ctx.fillText(p.ch, p.x, p.y);
  }
  for (const p of fx.pops) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.font = `${p.s}px ${PIX}`;
    ctx.fillStyle = C.blue;
    ctx.fillText(p.text, p.x + 1, p.y + 1);
    ctx.fillStyle = p.c;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}
