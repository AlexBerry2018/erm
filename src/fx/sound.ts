// Звук: WebAudio-пищалки в духе игрушек 2000-х. Без файлов.
let AC: AudioContext | null = null;
let MASTER: GainNode | null = null;
let NOISE: AudioBuffer | null = null;
export const sound = { muted: false };

/** Аудио можно включить только по жесту пользователя. */
export function unlockAudio(): void {
  try {
    if (!AC) {
      AC = new AudioContext();
      MASTER = AC.createGain();
      MASTER.gain.value = 0.8;
      MASTER.connect(AC.destination);
    }
    if (AC.state === 'suspended') void AC.resume();
  } catch {
    AC = null;
  }
}

function live(): AudioContext | null {
  return !sound.muted && AC && AC.state === 'running' ? AC : null;
}

const note = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function tone(f: number, d: number, type: OscillatorType, vol: number, delay = 0, f2?: number): void {
  const a = live();
  if (!a || !MASTER) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.setValueAtTime(vol, t + d * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(MASTER);
  o.start(t);
  o.stop(t + d + 0.03);
}

function noise(d: number, vol: number, freq: number, q = 1, delay = 0, kind: BiquadFilterType = 'bandpass'): void {
  const a = live();
  if (!a || !MASTER) return;
  if (!NOISE) {
    NOISE = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const c = NOISE.getChannelData(0);
    // шум — не игровая логика, сид не нужен
    for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  src.buffer = NOISE;
  f.type = kind;
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(f);
  f.connect(g);
  g.connect(MASTER);
  src.start(t);
  src.stop(t + d + 0.02);
}

// ограничитель: в лавине касаний не больше ~25 звуков в секунду
let lastTouch = 0;

export const sfx = {
  /** Касание: высота растёт с номером касания в цепочке. */
  touch(chain: number, big = false) {
    const now = performance.now();
    if (!big && now - lastTouch < 40) return;
    lastTouch = now;
    const n = 64 + Math.min(chain, 40) * 0.75;
    tone(note(n), 0.06, 'square', 0.035);
    if (big) tone(note(n + 7), 0.09, 'triangle', 0.04, 0.03);
  },
  drop() { tone(note(84), 0.05, 'square', 0.03); tone(note(91), 0.07, 'square', 0.03, 0.05); },
  hole(good: boolean) {
    if (good) [72, 76, 79, 84].forEach((n, i) => tone(note(n), 0.07, 'square', 0.04, i * 0.04));
    else tone(note(60), 0.12, 'triangle', 0.05);
  },
  split() { tone(note(88), 0.05, 'square', 0.03); tone(note(95), 0.06, 'square', 0.03, 0.04); },
  explode() { noise(0.35, 0.2, 700, 0.8); tone(110, 0.25, 'sawtooth', 0.05, 0, 55); },
  cat() { tone(700, 0.18, 'triangle', 0.05, 0, 1100); tone(1000, 0.14, 'triangle', 0.04, 0.16, 600); },
  hate() { tone(220, 0.15, 'sawtooth', 0.05, 0, 110); },
  eat() { noise(0.12, 0.12, 2400, 2); tone(note(55), 0.12, 'square', 0.04, 0.05); },
  jackpot() {
    [84, 88, 91, 96, 91, 96, 100, 103].forEach((n, i) => { tone(note(n), 0.14, 'square', 0.045, i * 0.07); tone(note(n - 24), 0.14, 'triangle', 0.05, i * 0.07); });
    noise(0.6, 0.12, 5000, 0.7, 0.55, 'highpass');
  },
  /** Тик досчёта: тон поднимается с прогрессом 0..1. */
  tick(p: number) { tone(note(70 + p * 26), 0.035, 'square', 0.025); },
  total(big: boolean) { [72, 79, 84].forEach((n, i) => tone(note(n + (big ? 12 : 0)), 0.1, 'triangle', 0.05, i * 0.06)); },
  record() { [96, 100, 103, 108, 103, 108, 112].forEach((n, i) => tone(note(n), 0.14, 'triangle', 0.045, i * 0.06)); },
  clear() { [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => tone(note(n), 0.1, 'square', 0.04, i * 0.06)); },
  fail() { [67, 63, 60, 55].forEach((n, i) => tone(note(n), 0.2, 'triangle', 0.05, i * 0.16)); },
  pick() { tone(note(84), 0.06, 'square', 0.035); tone(note(96), 0.08, 'square', 0.035, 0.06); },
  click() { tone(1200, 0.03, 'square', 0.03); },
  deny() { tone(220, 0.09, 'square', 0.04); tone(196, 0.12, 'square', 0.04, 0.12); },
};
