// Камера стримерши и чат. Случайность тут косметическая (кто и что пишет), на счёт не влияет.

export type Emotion = 'calm' | 'wow' | 'scream' | 'sad' | 'happy';

const EYES: Record<Emotion, [string, string]> = {
  calm: ['O', 'O'], wow: ['@', '@'], scream: ['>', '<'], sad: ['T', 'T'], happy: ['^', '^'],
};
const MOUTH: Record<Emotion, string> = { calm: '_', wow: 'o', scream: 'O', sad: 'n', happy: 'w' };

export function faceArt(e: Emotion, blink = false): string {
  const [l, r] = blink ? ['-', '-'] : EYES[e];
  const blush = e === 'happy' || e === 'scream' ? '//' : '  ';
  return [
    '     .-~~~~~~~~-.',
    "   .'/ / /  \\ \\ \\'.",
    '  / / / /    \\ \\ \\ \\',
    ` [=]|  ${l}      ${r}  |[=]`,
    ` [=]|  ${blush}    ${blush}  |[=]`,
    `    \\     ${MOUTH[e]}      /`,
    "     '.________.'",
    '      /|  ||  |\\',
  ].join('\n');
}

const NICKS = ['Glitter_Girl', 'Kiber_Tim', '~*Ksu*~', 'NeoHacker', 'dj_Vasya', 'olds_2001', 'pager_girl', 'Tamago4i',
  'Millenium99', 'nya_nya', 'ModemMan', 'xX_Diskette_Xx', 'kotofan', 'Win95_forever', 'ICQ_4ever'];

export const LINES = {
  ambient: ['олды тут', 'кто в 2000?', 'ностальгия...', 'кидай в центр!!', 'где кот?', '<3', 'лагает?', 'go go go', 'ахах',
    'стрим года', 'модем ииии', 'я плачу', 'топ', 'первый!', 'xD', '^_^', 'кот топ', 'привет из 2003', 'дай две'],
  touch: ['+1', 'ого', 'nice', 'бум', 'дзынь', 'ещё!', '666', 'чётко'],
  chain: ['КОМБО', 'не останавливайся', 'пальцы-молнии', 'как она это делает', 'безумие', 'это законно?', 'ЕЩЁ ЕЩЁ'],
  cat: ['КОТ!!!', 'котик отбил', 'кот-вратарь', 'мур', 'кот решает', 'ловкий котяра', 'ฅ^•ﻌ•^ฅ'],
  split: ['раздвоилась!', 'x2 монетки', 'дискета топ', 'копипаст'],
  explode: ['БАБАХ', 'ошибка 0x0000', 'всё сломалось лол', 'перезагрузи!', 'окно рвануло'],
  hate: ['фу', 'кринж', 'скучно', 'отписка', 'мод спит?', 'бан хейтерам!!'],
  eat: ['корзина съела', 'в мусор её', 'донат в корзину', 'ням'],
  mult: ['ИКСЫ', 'x2!!!', 'x3!!!', 'множитель!!', '8888'],
  jackpot: ['КОШАЧЬЯ ЛАВИНА', 'ААААААА', '88888888', 'ДЖЕКПОТ', 'ЛЕГЕНДА', 'скрин!!', 'кот богач', 'ВАУ ВАУ ВАУ'],
  bad: ['мимо', 'ну такое', 'F', 'бывает', 'в следующий раз'],
  good: ['красава', 'GG', 'огонь', 'лучшая', 'вот это бросок'],
  record: ['РЕКОРД!!!', 'новый рекорд', 'это история', 'клип!!'],
  fail: ['F', 'эфир упал', 'не грусти!', 'мы с тобой', 'ещё раз!', 'держи котика'],
  clear: ['порог взят!', 'GG WP', 'дальше!', 'ну всё, легенда'],
  boss: ['ХЕЙТЕРЫ ПРИШЛИ', 'бан им!', 'не трогай хейт!', 'мод проснись'],
};

export const SAYS = {
  start: ['Всем приветики! Кидаем донатики!', 'Мы в эфире! Чат, держите монетки!', 'Хай, чат! Сегодня собираем комбо!'],
  aim: ['Куда кидаем, чат?', 'Целюсь…', 'Только не в корзину…'],
  good: ['Йес! Вот это бросок!', 'Чат, вы видели?!', 'Ого-го!'],
  bad: ['Эх… ну ничего.', 'Мимо кассы.', 'Ладно, следующий!'],
  jackpot: ['КОШАЧЬЯ ЛАВИНА!!! АААА!', 'КОТ, ТЫ ЛУЧШИЙ!!!'],
  cat: ['Кот, ну ты чего!', 'Котик в деле!', 'Мур-мур, отбивай!'],
  clear: ['Порог взят! Выбираем подарок!', 'Есть! Чат, что ставим на стол?'],
  fail: ['Эфир упал… Но мы вернёмся!', 'Не хватило чуть-чуть… Ещё раз?'],
  win: ['МЫ СДЕЛАЛИ ЭТО! Лучший эфир!', 'Все пороги взяты! Чат, вы чудо!'],
  boss: ['Ой… хейтеры в чате. Не задевай их!'],
  layout: ['Двигаем окна! Строим машину комбо.'],
};

export function pickC<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

export class Stream {
  private face: HTMLElement;
  private sayEl: HTMLElement;
  private log: HTMLElement;
  private emo: Emotion = 'calm';
  private emoUntil = 0;
  private lastChat = 0;
  private blinkAt = 0;

  constructor(face: HTMLElement, say: HTMLElement, log: HTMLElement) {
    this.face = face;
    this.sayEl = say;
    this.log = log;
    this.setFace('calm');
  }

  setFace(e: Emotion, ms = 0): void {
    this.emo = e;
    this.emoUntil = ms ? performance.now() + ms : 0;
    this.face.textContent = faceArt(e);
    this.face.dataset.emo = e;
  }

  say(text: string, e?: Emotion, ms = 2500): void {
    this.sayEl.textContent = '«' + text + '»';
    if (e) this.setFace(e, ms);
  }

  /** Строка в чат. throttle — не чаще раза в N мс (для частых событий). */
  chat(text: string, cls: '' | 'hot' | 'sys' | 'gold' = '', throttle = 0): void {
    const now = performance.now();
    if (throttle && now - this.lastChat < throttle) return;
    this.lastChat = now;
    const p = document.createElement('p');
    if (cls === 'sys') {
      p.className = 'sys';
      p.textContent = '» ' + text;
    } else {
      const i = document.createElement('i');
      i.textContent = pickC(NICKS) + ': ';
      p.append(i, text);
      if (cls) p.className = cls;
    }
    this.log.append(p);
    while (this.log.children.length > 40) this.log.firstChild!.remove();
  }

  spam(pool: readonly string[], n: number, cls: '' | 'hot' | 'gold' = 'hot', every = 90): void {
    for (let i = 0; i < n; i++) setTimeout(() => this.chat(pickC(pool), cls), i * every);
  }

  /** Раз в кадр: моргание и возврат к спокойному лицу. */
  update(now: number): void {
    if (this.emoUntil && now > this.emoUntil) this.setFace('calm');
    if (now > this.blinkAt) {
      this.face.textContent = faceArt(this.emo, true);
      setTimeout(() => (this.face.textContent = faceArt(this.emo)), 120);
      this.blinkAt = now + 2500 + Math.random() * 3000;
    }
  }
}
