// Контроллер: связывает забег, бросок, рендер, эффекты, стрим и DOM-интерфейс.
import { BoardObject, DEFS, H, RARITY_NAMES, W } from './board/defs';
import { Peg, activePegs, clampToArea, fits } from './board/board';
import {
  ROUNDS, Run, ThrowEnd, beginThrow, endThrow, fame, isBoss, moveObj, newRun, nextRound, pickOffer, reroll, target, Offer,
} from './run/run';
import { CAT_MAX, SimEvent, ThrowSim, previewPath } from './run/throw';
import { TICK } from './physics/physics';
import { newSeed, normSeed } from './run/rng';
import { Fx } from './fx/fx';
import { sfx, sound, unlockAudio } from './fx/sound';
import { LINES, SAYS, Stream, pickC } from './stream/stream';
import { C, View, render } from './ui/render';
import { persist, save } from './meta/save';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' млрд';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' млн';
  return Math.round(n).toLocaleString('ru-RU');
}

export function fmtMult(m: number): string {
  if (m >= 1000) return '×' + fmt(m);
  const s = m >= 10 ? m.toFixed(1) : m.toFixed(2);
  return '×' + s.replace(/\.?0+$/, '').replace('.', ',');
}

type Mode = 'title' | 'aim' | 'throw' | 'count' | 'pause' | 'offer' | 'layout' | 'over';

interface Drag {
  id: number;
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  invalid: boolean;
}

export class Game {
  run: Run | null = null;
  sim: ThrowSim | null = null;
  mode: Mode = 'title';
  aimX = W / 2;
  fx = new Fx();
  stream: Stream;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private view: View = { s: 1, ox: 0, oy: 0, dpr: 1 };
  private pegs: Peg[] = [];
  private preview: { x: number; y: number }[] | null = null;
  private acc = 0;
  private time = 0;
  private drag: Drag | null = null;
  private fresh: number | null = null;
  private pointerAiming = false;
  private count: { from: number; to: number; t: number; dur: number; end: ThrowEnd; lastTick: number } | null = null;
  private startedAt = 0;
  private lastHint = '';
  private recordBase = 0; // рекорд на момент старта забега: «НОВЫЙ РЕКОРД» — не чаще раза за забег

  constructor() {
    this.canvas = $<HTMLCanvasElement>('board');
    this.ctx = this.canvas.getContext('2d')!;
    this.stream = new Stream($('face'), $('say'), $('log'));
    this.applySettings();
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe($('view'));
    this.resize();
    this.showTitle();
    this.stream.chat('где стрим??');
    this.stream.chat('она кидает донаты в рабочий стол, я видел', 'hot');
    // фон чата: живой эфир
    setInterval(() => {
      if (this.mode !== 'title' && Math.random() < 0.45) this.stream.chat(pickC(LINES.ambient));
    }, 2600);
  }

  // ---------- экраны ----------

  private overlay(html: string): HTMLElement {
    const o = $('over');
    o.innerHTML = html;
    return o;
  }

  showTitle(seed?: string): void {
    this.mode = 'title';
    this.hint('Введи сид или оставь пустым.');
    const o = this.overlay(`
      <h2>РАБОЧИЙ СТОЛ-ПИНБОЛ</h2>
      <p>Кидай донат-монетки на рабочий стол. Они отскакивают от окон, иконок и кота, а лунки внизу умножают зрителей. Набери порог за 5 бросков — и так ${ROUNDS} раунда. В ${ROUNDS}-м придут хейтеры.</p>
      <div class="seedrow"><label for="seedIn">сид</label><input id="seedIn" maxlength="12" placeholder="случайный" value="${seed ?? ''}" autocomplete="off" spellcheck="false"></div>
      <div class="btns"><button class="btn pink" id="startBtn">▶ Начать эфир</button></div>
      <p class="dim">Тап или перетаскивание по столу — прицел, отпусти — бросок. На ПК: ← → и пробел.</p>`);
    o.querySelector<HTMLButtonElement>('#startBtn')!.onclick = () => {
      unlockAudio();
      const v = normSeed(o.querySelector<HTMLInputElement>('#seedIn')!.value);
      this.start(v || newSeed());
    };
    this.updateHud();
  }

  start(seed: string): void {
    this.run = newRun(seed);
    this.sim = null;
    this.fx.clear();
    this.overlay('');
    this.startedAt = performance.now();
    this.recordBase = save.bestThrow;
    $('seed').textContent = seed;
    $('rounds').textContent = String(ROUNDS);
    $('log').textContent = '';
    this.stream.chat(`Эфир начался · сид ${seed}`, 'sys');
    this.stream.say(pickC(SAYS.start), 'happy');
    this.refreshBoard();
    this.toAim();
    this.banner(`РАУНД 1`, `порог ${target(1)} 👁 за 5 бросков`);
    sfx.pick();
  }

  private toAim(): void {
    this.mode = 'aim';
    this.hint('Тапни по столу — монетка полетит оттуда. Пунктир — первые отскоки.');
    this.updatePreview();
    this.updateHud();
  }

  private showOffers(): void {
    const run = this.run!;
    this.mode = 'offer';
    this.hint('Выбери, что поставить на стол.');
    const card = (o: Offer, i: number) => {
      let title = '';
      let desc = '';
      let art = '';
      if (o.kind === 'catnip') {
        title = 'Кошачья мята';
        desc = 'шкала кота сразу полная: попади в лунку КОТ — будет лавина';
        art = ' /\\_/\\\n( ✦.✦ )\n > ^ <';
      } else {
        const d = DEFS[o.type];
        title = (o.kind === 'up' ? 'Улучшить: ' : '') + d.name + ' ' + '★'.repeat(o.lvl);
        desc = d.desc(o.lvl);
        art = ASCII_ICON[o.type];
      }
      return `<button class="card rar${o.rarity}" data-i="${i}"><span class="r">${RARITY_NAMES[o.rarity]}</span><pre>${art}</pre><b>${title}</b><span class="d">${desc}</span></button>`;
    };
    const o = this.overlay(`
      <h2>ВЫБЕРИ 1 ИЗ 3</h2>
      <p class="dim">раунд ${run.round} пройден · донаты ◈ ${run.donats}</p>
      <div class="cards">${run.offers.map(card).join('')}</div>
      <div class="btns"><button class="btn grey" id="rerollBtn" ${run.donats < run.rerollCost ? 'disabled' : ''}>↻ другие (◈ ${run.rerollCost})</button></div>`);
    o.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => {
      b.onclick = () => this.pick(Number(b.dataset.i));
    });
    o.querySelector<HTMLButtonElement>('#rerollBtn')!.onclick = () => {
      if (reroll(run)) {
        sfx.click();
        this.stream.chat('реролл!!', 'hot');
        this.showOffers();
      } else sfx.deny();
    };
    this.updateHud();
  }

  pick(i: number): void {
    const run = this.run!;
    const o = run.offers[i];
    const id = pickOffer(run, i);
    if (run.phase !== 'layout') return;
    sfx.pick();
    this.fresh = id;
    this.overlay('');
    this.refreshBoard();
    const name = o.kind === 'catnip' ? 'кошачья мята' : DEFS[o.type].name;
    this.stream.chat(`На стол: ${name}`, 'sys');
    this.stream.say(pickC(SAYS.layout), 'happy');
    this.mode = 'layout';
    this.hint('Раскладка: перетащи окна и иконки. Потом «▶ В ЭФИР».');
    this.banner('РАСКЛАДКА', 'двигай окна — строй машину комбо');
    this.updateHud();
  }

  next(): void {
    const run = this.run!;
    if (this.mode !== 'layout') return;
    nextRound(run);
    this.fresh = null;
    sfx.click();
    if (isBoss(run.round)) {
      this.banner('БОСС: ХЕЙТЕРЫ', 'не задевай пузыри — они гасят множители');
      this.stream.say(pickC(SAYS.boss), 'sad');
      this.stream.spam(LINES.boss, 5);
    } else {
      this.banner(`РАУНД ${run.round}`, `порог ${fmt(target(run.round))} 👁 за 5 бросков`);
    }
    this.toAim();
  }

  private showEnd(won: boolean): void {
    const run = this.run!;
    this.mode = 'over';
    this.hint(won ? 'Эфир покорён!' : 'Эфир окончен. Ещё один?');
    const deficit = target(run.round) - run.roundViewers;
    const near = !won && deficit <= target(run.round) * 0.25
      ? `<p style="color:var(--gold);font-weight:700">Не хватило всего ${fmt(deficit)} 👁!</p>` : '';
    const o = this.overlay(`
      <h2>${won ? 'ЭФИР ПОКОРЁН' : 'ЭФИР УПАЛ'}</h2>
      ${near}
      <div class="stats">
        <span>дошла до раунда</span><b>${won ? `все ${ROUNDS}` : run.round}</b>
        <span>пик зрителей</span><b>${fmt(run.peak)} 👁</b>
        <span>лучший бросок</span><b>${fmt(run.bestThrow)}</b>
        <span>кошачьих лавин</span><b>${run.jackpots}</b>
        <span>слава</span><b>✦ ${fame(run)}</b>
        <span>сид</span><b>${run.seed}</b>
      </div>
      <div class="btns"><button class="btn pink" id="againBtn">▶ Новый эфир</button><button class="btn" id="sameBtn">↻ Тот же сид</button></div>
      <p class="dim">Слава и Студия появятся в следующей версии.</p>`);
    o.querySelector<HTMLButtonElement>('#againBtn')!.onclick = () => this.start(newSeed());
    o.querySelector<HTMLButtonElement>('#sameBtn')!.onclick = () => this.start(run.seed);
    this.updateHud();
  }

  private banner(title: string, sub = '', gold = false, ms = 1600): void {
    const b = $('banner');
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.toggle('gold', gold);
    b.hidden = false;
    // перезапуск анимации появления
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout((b as unknown as { _t: number })._t);
    (b as unknown as { _t: number })._t = window.setTimeout(() => (b.hidden = true), ms);
  }

  private hint(text: string): void {
    if (text === this.lastHint) return;
    this.lastHint = text;
    $('hint').textContent = text;
  }

  // ---------- бросок ----------

  throwAt(x: number): void {
    const run = this.run;
    if (!run || this.mode !== 'aim') return;
    unlockAudio();
    this.aimX = Math.max(8, Math.min(W - 8, x));
    this.sim = beginThrow(run, this.aimX);
    this.mode = 'throw';
    this.acc = 0;
    this.preview = null;
    sfx.drop();
    if (Math.random() < 0.4) this.stream.say(pickC(SAYS.aim), 'calm');
    this.hint('Летит!..');
    $('tally').hidden = false;
    this.updateHud();
  }

  private onEvent(e: SimEvent): void {
    const fx = this.fx;
    const st = this.stream;
    switch (e.t) {
      case 'touch': {
        const big = e.what !== 'peg';
        if (e.what === 'peg') fx.pegFlash.push({ x: e.x, y: e.y, life: 1 });
        else if (e.objId) fx.objFlash.set(e.objId, 1);
        if (e.what === 'hate') {
          fx.pop(e.x, e.y, 'ХЕЙТ ×1', C.pink, 9);
          fx.burst(e.x, e.y, 10, C.pink);
          fx.addShake(5);
          sfx.hate();
          st.chat(pickC(LINES.hate), 'hot');
          st.say('Ну хейтеры, ну блин!', 'sad', 1500);
          break;
        }
        const col = e.painted ? C.pink : e.what === 'cat' ? C.gold : C.blue;
        fx.pop(e.x, e.y - 6, (e.what === 'trash' ? '+10 ◈' : '+' + e.gain), col, e.what === 'peg' ? 7 : 9);
        sfx.touch(e.chain, big);
        if (e.what === 'cat') {
          fx.catFlash = 1;
          fx.hitstop(50);
          fx.addShake(3);
          fx.burst(e.x, e.y, 8, C.gold);
          sfx.cat();
          st.chat(pickC(LINES.cat), 'gold');
          if (Math.random() < 0.4) st.say(pickC(SAYS.cat), 'wow', 1200);
        } else if (e.what === 'trash') {
          sfx.eat();
          st.chat(pickC(LINES.eat), '', 400);
        } else if (e.what === 'paint') {
          fx.burst(e.x, e.y, 6, C.pink, 0.6);
        } else if (big) {
          fx.hitstop(30);
          st.chat(pickC(LINES.touch), '', 700);
        }
        if (e.chain === 12 || e.chain === 25 || e.chain === 50) {
          st.spam(LINES.chain, 3);
          st.setFace('wow', 1200);
          fx.pop(W / 2, 40, `ЦЕПЬ ${e.chain}!`, C.gold, 11);
        }
        break;
      }
      case 'hole': {
        fx.holeFlash[e.hole] = 1;
        const good = e.factor > 1 || e.gain > 0;
        const label = e.kind === 'КОРЗИНА' ? '+3 ◈' : e.factor > 1 ? fmtMult(e.factor) : e.gain ? '+' + e.gain : e.kind;
        fx.pop(e.x, e.y - 22, e.hated && (e.kind === '×2' || e.kind === '×3') ? 'ХЕЙТ ✕' : label, e.factor > 1 ? C.pink : C.blue, e.factor >= 2 ? 13 : 9);
        sfx.hole(good);
        if (e.factor >= 2) {
          fx.hitstop(60);
          fx.addShake(2 + e.factor * 1.5);
          fx.burst(e.x, e.y - 10, 12, C.pink, 1.2);
          st.chat(pickC(LINES.mult), 'hot');
        }
        break;
      }
      case 'split':
        sfx.split();
        fx.burst(e.x, e.y, 6, C.blue, 0.7);
        this.stream.chat(pickC(LINES.split), '', 500);
        break;
      case 'explode':
        sfx.explode();
        fx.burst(e.x, e.y, 26, C.pink, 1.6);
        fx.burst(e.x, e.y, 10, C.gold, 1.2);
        fx.addShake(7);
        fx.hitstop(70);
        st.chat(pickC(LINES.explode), 'hot');
        st.setFace('wow', 1000);
        break;
      case 'catCharge':
        this.updateHud();
        if (e.charge >= CAT_MAX) {
          st.chat('ШКАЛА КОТА ПОЛНАЯ — в лунку КОТ!', 'sys');
        }
        break;
      case 'jackpot':
        sfx.jackpot();
        fx.addShake(12);
        fx.hitstop(140);
        for (let i = 0; i < 4; i++) fx.burst(e.x + (i - 1.5) * 60, H - 30, 18, i % 2 ? C.gold : C.pink, 2);
        st.spam(LINES.jackpot, 14, 'gold', 80);
        st.say(pickC(SAYS.jackpot), 'scream', 3000);
        this.banner('КОШАЧЬЯ ЛАВИНА!', 'с неба падают коты-монетки', true, 2000);
        break;
      case 'done':
        break;
    }
  }

  private finishThrow(): void {
    const run = this.run!;
    const sim = this.sim!;
    const end = endThrow(run, sim);
    const to = end.res.score;
    const dur = 0.5 + Math.min(1.6, Math.log10(to + 1) * 0.35);
    this.count = { from: 0, to, t: 0, dur, end, lastTick: 0 };
    this.mode = 'count';
  }

  private stepCount(dt: number): void {
    const c = this.count!;
    c.t += dt;
    const p = Math.min(1, c.t / c.dur);
    const v = Math.round(c.to * p * p); // досчёт с ускорением
    const tally = $('tally');
    const res = c.end.res;
    tally.innerHTML = `${fmt(v)}<small>${fmt(res.viewers)} 👁 ${fmtMult(res.mult)}</small>`;
    if (c.t - c.lastTick > 0.06 && p < 1) {
      c.lastTick = c.t;
      sfx.tick(p);
    }
    if (p >= 1) this.afterCount();
  }

  private afterCount(): void {
    const run = this.run!;
    const end = this.count!.end;
    this.count = null;
    const res = end.res;
    const tally = $('tally');
    tally.classList.toggle('big', res.score >= 100);
    tally.classList.remove('pulse');
    void tally.offsetWidth;
    tally.classList.add('pulse');
    sfx.total(res.score >= target(run.round) / 3);
    if (res.score > this.recordBase && this.recordBase > 0) {
      this.recordBase = Infinity;
      sfx.record();
      this.banner('НОВЫЙ РЕКОРД', fmt(res.score) + ' за бросок', true);
      this.stream.spam(LINES.record, 4, 'gold');
    }
    if (res.score > save.bestThrow) {
      save.bestThrow = res.score;
      persist();
    }
    if (res.score >= target(run.round) / 3) {
      this.stream.say(pickC(SAYS.good), 'happy');
      this.stream.chat(pickC(LINES.good), 'hot');
    } else if (res.score < target(run.round) / 10) {
      this.stream.say(pickC(SAYS.bad), 'sad', 1500);
      this.stream.chat(pickC(LINES.bad));
    }
    this.sim = null;
    this.updateHud();
    this.mode = 'pause';
    const after = (ms: number, f: () => void) => setTimeout(() => {
      $('tally').hidden = true;
      f();
    }, ms);
    if (end.won) {
      sfx.clear();
      this.stream.say(pickC(SAYS.win), 'scream', 4000);
      this.stream.spam(LINES.clear, 6);
      after(1200, () => this.showEnd(true));
    } else if (end.cleared) {
      sfx.clear();
      this.banner('ПОРОГ ВЗЯТ!', end.bonus ? `+${end.bonus} ◈ за оставшиеся броски` : '', true);
      this.stream.say(pickC(SAYS.clear), 'happy');
      this.stream.spam(LINES.clear, 3);
      this.stream.chat(`Раунд ${run.round} пройден: ${fmt(run.roundViewers)} 👁`, 'sys');
      after(1300, () => this.showOffers());
    } else if (end.failed) {
      sfx.fail();
      this.stream.say(pickC(SAYS.fail), 'sad', 5000);
      this.stream.spam(LINES.fail, 4, '');
      after(1300, () => this.showEnd(false));
    } else {
      const left = target(run.round) - run.roundViewers;
      // почти-попадание: подсвечиваем, сколько осталось
      if (run.throwsLeft === 1) this.stream.chat(`Последний бросок! Нужно ещё ${fmt(left)} 👁`, 'sys');
      after(700, () => this.toAim());
    }
  }

  // ---------- кадр ----------

  frame(dt: number): void {
    this.time += dt;
    const now = performance.now();
    this.stream.update(now);
    if (this.mode === 'throw' && this.sim) {
      if (now >= this.fx.hitstopUntil) {
        this.acc += dt;
        // в лавине монеток не даём кадру захлебнуться
        let n = 0;
        while (this.acc >= TICK && !this.sim.done && n < 12) {
          this.acc -= TICK;
          n++;
          this.sim.step();
          for (const e of this.sim.events) this.onEvent(e);
          this.sim.events.length = 0;
          if (performance.now() < this.fx.hitstopUntil) {
            this.acc = 0;
            break;
          }
        }
        if (n >= 12) this.acc = 0;
      }
      const t = $('tally');
      t.classList.remove('big');
      t.innerHTML = `${fmt(this.sim.viewers)} 👁 <span style="color:var(--blue)">${fmtMult(this.sim.mult)}</span>`;
      if (this.sim.done) this.finishThrow();
      this.updateCur();
    } else if (this.mode === 'count') {
      this.stepCount(dt);
    }
    this.fx.update(dt);
    this.draw();
    this.updateClock();
  }

  private draw(): void {
    const run = this.run;
    const objs = run ? run.objs : DEMO_OBJS;
    const sim = this.sim;
    render(this.ctx, this.view, {
      objs,
      pegs: this.pegs,
      coins: sim ? sim.coins : [],
      hates: sim ? sim.hates : [],
      cat: sim ? sim.cat : run ? run.cat : DEMO_CAT,
      catFull: (sim ? sim.catCharge : run?.catCharge ?? 0) >= CAT_MAX,
      broken: sim ? sim.brokenErrors : EMPTY,
      aimX: this.mode === 'aim' ? this.aimX : null,
      preview: this.mode === 'aim' ? this.preview : null,
      layout: this.mode === 'layout' ? { dragId: this.drag?.id ?? null, invalid: this.drag?.invalid ?? false, fresh: this.fresh } : null,
      time: this.time,
    }, this.fx);
  }

  private refreshBoard(): void {
    this.pegs = activePegs(this.run ? this.run.objs : DEMO_OBJS);
    this.updatePreview();
  }

  private updatePreview(): void {
    if (this.mode !== 'aim' || !this.run) {
      this.preview = null;
      return;
    }
    this.preview = previewPath(this.run.objs, this.aimX);
  }

  // ---------- HUD ----------

  updateHud(): void {
    const run = this.run;
    const shown = run ? run.roundViewers : 0;
    const tgt = run ? target(run.round) : target(1);
    $('viewers').textContent = fmt(shown);
    $('target').textContent = fmt(tgt);
    $('camViewers').textContent = fmt(run ? run.total : 0);
    $('bar').style.transform = `scaleX(${Math.min(1, shown / tgt)})`;
    $('round').textContent = String(run?.round ?? 1);
    const left = run ? run.throwsLeft : 5;
    $('throws').textContent = '●'.repeat(left) + '○'.repeat(Math.max(0, 5 - left));
    $('donats').textContent = '◈ ' + fmt(run?.donats ?? 0);
    const ch = this.sim ? this.sim.catCharge : run?.catCharge ?? 0;
    const catEl = $('cat');
    catEl.textContent = '■'.repeat(ch) + '□'.repeat(CAT_MAX - ch);
    catEl.classList.toggle('full', ch >= CAT_MAX);
    $('best').textContent = fmt(save.bestThrow);
    const need = tgt - shown;
    $('near').textContent = run && run.phase === 'aim' && need > 0 ? `ещё ${fmt(need)} 👁` : '';
    const go = $<HTMLButtonElement>('go');
    go.textContent = this.mode === 'layout' ? '▶ В ЭФИР' : '▶ БРОСОК';
    go.disabled = !(this.mode === 'aim' || this.mode === 'layout');
    this.updateCur();
  }

  private updateCur(): void {
    const s = this.sim;
    $('cur').textContent = s ? `${fmt(s.viewers)} ${fmtMult(s.mult)}` : '—';
  }

  private updateClock(): void {
    if (!this.run) return;
    const s = Math.floor((performance.now() - this.startedAt) / 1000);
    const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const el = $('clock');
    if (el.textContent !== txt) el.textContent = txt;
  }

  // ---------- настройки ----------

  private applySettings(): void {
    document.documentElement.dataset.vhs = save.settings.vhs ? 'on' : 'off';
    sound.muted = !save.settings.sound;
    $('vhsBtn').textContent = 'VHS ' + (save.settings.vhs ? 'вкл' : 'выкл');
    $('snd').textContent = '♪ ' + (save.settings.sound ? 'вкл' : 'выкл');
  }

  // ---------- ввод ----------

  private resize(): void {
    const el = $('view');
    const r = el.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    const pad = 4;
    const s = Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H);
    this.view = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2, dpr };
  }

  private toWorld(ev: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left - this.view.ox) / this.view.s, y: (ev.clientY - r.top - this.view.oy) / this.view.s };
  }

  private objAt(x: number, y: number): BoardObject | null {
    const objs = this.run?.objs ?? [];
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      const d = DEFS[o.type];
      const m = 6; // запас под палец
      if (d.shape === 'win') {
        if (x > o.x - m && x < o.x + d.w + m && y > o.y - m && y < o.y + d.h + m) return o;
      } else if ((x - o.x) ** 2 + (y - o.y) ** 2 < (d.r + m + 4) ** 2) return o;
    }
    return null;
  }

  private setAim(x: number): void {
    const nx = Math.max(8, Math.min(W - 8, x));
    if (Math.abs(nx - this.aimX) < 0.5) return;
    this.aimX = nx;
    this.updatePreview();
  }

  private bindInput(): void {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (ev) => {
      unlockAudio();
      const p = this.toWorld(ev);
      if (this.mode === 'aim') {
        this.pointerAiming = true;
        cv.setPointerCapture(ev.pointerId);
        this.setAim(p.x);
      } else if (this.mode === 'layout') {
        const o = this.objAt(p.x, p.y);
        if (!o) return;
        cv.setPointerCapture(ev.pointerId);
        this.drag = { id: o.id, dx: o.x - p.x, dy: o.y - p.y, ox: o.x, oy: o.y, invalid: false };
        sfx.click();
      }
    });
    cv.addEventListener('pointermove', (ev) => {
      const p = this.toWorld(ev);
      if (this.mode === 'aim' && (this.pointerAiming || ev.pointerType === 'mouse')) this.setAim(p.x);
      else if (this.mode === 'layout' && this.drag && this.run) {
        const o = this.run.objs.find((q) => q.id === this.drag!.id)!;
        o.x = Math.round(p.x + this.drag.dx);
        o.y = Math.round(p.y + this.drag.dy);
        clampToArea(o);
        this.drag.invalid = !fits(o, this.run.objs);
        this.pegs = activePegs(this.run.objs);
      }
    });
    const up = (ev: PointerEvent) => {
      if (this.mode === 'aim' && this.pointerAiming) {
        this.pointerAiming = false;
        const p = this.toWorld(ev);
        this.setAim(p.x);
        this.throwAt(this.aimX);
      } else if (this.drag && this.run) {
        const d = this.drag;
        const o = this.run.objs.find((q) => q.id === d.id)!;
        const x = o.x;
        const y = o.y;
        o.x = d.ox;
        o.y = d.oy;
        if (!moveObj(this.run, d.id, x, y)) {
          sfx.deny();
          this.hint('Так не встанет: окна не должны слипаться и вылезать за пунктир.');
        } else sfx.click();
        this.drag = null;
        this.refreshBoard();
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => {
      this.pointerAiming = false;
      if (this.drag && this.run) {
        const o = this.run.objs.find((q) => q.id === this.drag!.id)!;
        o.x = this.drag.ox;
        o.y = this.drag.oy;
        this.drag = null;
        this.refreshBoard();
      }
    });
    addEventListener('keydown', (ev) => {
      if ((ev.target as HTMLElement).tagName === 'INPUT') {
        if (ev.key === 'Enter') $('startBtn')?.click();
        return;
      }
      if (this.mode === 'aim') {
        if (ev.key === 'ArrowLeft' || ev.key === 'a') { this.setAim(this.aimX - 8); ev.preventDefault(); }
        if (ev.key === 'ArrowRight' || ev.key === 'd') { this.setAim(this.aimX + 8); ev.preventDefault(); }
        if (ev.key === ' ' || ev.key === 'Enter') { this.throwAt(this.aimX); ev.preventDefault(); }
      } else if (this.mode === 'layout' && (ev.key === 'Enter' || ev.key === ' ')) {
        this.next();
        ev.preventDefault();
      } else if (this.mode === 'offer' && ['1', '2', '3'].includes(ev.key)) {
        this.pick(Number(ev.key) - 1);
      }
    });
    $('go').onclick = () => {
      unlockAudio();
      if (this.mode === 'aim') this.throwAt(this.aimX);
      else if (this.mode === 'layout') this.next();
    };
    $('snd').onclick = () => {
      save.settings.sound = !save.settings.sound;
      persist();
      this.applySettings();
      unlockAudio();
      sfx.click();
    };
    $('vhsBtn').onclick = () => {
      save.settings.vhs = !save.settings.vhs;
      persist();
      this.applySettings();
      sfx.click();
    };
    $('restart').onclick = () => {
      if (this.mode === 'throw' || this.mode === 'count') return;
      this.showTitle(this.run?.seed);
    };
  }
}

const EMPTY = new Set<number>();
// стол на титульном экране
const DEMO_OBJS: BoardObject[] = [
  { id: 1, type: 'notepad', x: 60, y: 90, lvl: 1 },
  { id: 2, type: 'paint', x: 300, y: 70, lvl: 2 },
  { id: 3, type: 'error', x: 180, y: 180, lvl: 1 },
  { id: 4, type: 'floppy', x: 400, y: 200, lvl: 1 },
  { id: 5, type: 'trash', x: 90, y: 230, lvl: 1 },
];
const DEMO_CAT = { winId: 3, u: 0.5, dir: 1, timer: 999 };

const ASCII_ICON: Record<string, string> = {
  notepad: '.-------.\n|≡ ≡ ≡  |\n\'-------\'',
  paint: '.-------.\n|~*~ ■■ |\n\'-------\'',
  error: '.-------.\n| ⚠ OK  |\n\'-------\'',
  floppy: ' .----.\n | A: |\n \'----\'',
  trash: ' .__.\n |||| \n \'--\'',
};

