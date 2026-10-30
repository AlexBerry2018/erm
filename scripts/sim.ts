// Бот-симуляция баланса и проверка детерминизма.
//   npm run sim                 — 500 забегов, статистика
//   npm run sim -- 2000         — своё число забегов
//   npm run sim -- det          — только проверка детерминизма
//   npm run sim -- 500 targets=60,150,350,800
import { ROUNDS, TARGETS, beginThrow, endThrow, newRun, nextRound, pickOffer, Run } from '../src/run/run';
import { Rng, hashStr } from '../src/run/rng';
import { W } from '../src/board/defs';

interface BotRun {
  run: Run;
  scores: number[];
}

/** Бот: целится случайно (по своему сидовому ГСЧ), берёт случайное предложение, окна не двигает. */
function play(seed: string, aimSkill = 0): BotRun {
  const run = newRun(seed);
  const bot = new Rng(hashStr('bot:' + seed));
  const scores: number[] = [];
  for (;;) {
    if (run.phase === 'aim') {
      // aimSkill — доля бросков в центр (там множители и КОТ)
      const x = bot.next() < aimSkill ? bot.range(W * 0.3, W * 0.7) : bot.range(8, W - 8);
      const sim = beginThrow(run, x);
      sim.runToEnd();
      scores.push(endThrow(run, sim).res.score);
    } else if (run.phase === 'offer') {
      pickOffer(run, bot.int(run.offers.length));
    } else if (run.phase === 'layout') {
      nextRound(run);
    } else break;
  }
  return { run, scores };
}

function reached(r: Run): number {
  return r.phase === 'won' ? ROUNDS + 1 : r.round;
}

function stats(n: number, skill: number): void {
  const dist = new Array(ROUNDS + 2).fill(0);
  const all: number[] = [];
  let sumReached = 0;
  let jackpots = 0;
  for (let i = 0; i < n; i++) {
    const { run, scores } = play('BOT' + i, skill);
    const r = reached(run);
    dist[r]++;
    sumReached += r;
    jackpots += run.jackpots;
    all.push(...scores);
  }
  all.sort((a, b) => a - b);
  const q = (p: number) => all[Math.min(all.length - 1, Math.floor(all.length * p))];
  console.log(`\nбот (меткость ${skill}), забегов: ${n}`);
  console.log(`  средний дошедший раунд: ${(sumReached / n).toFixed(2)}   (${ROUNDS + 1} = прошёл все ${ROUNDS})`);
  console.log('  распределение: ' + dist.slice(1).map((c, i) => `р${i + 1}:${((c / n) * 100).toFixed(0)}%`).join('  ').replace(`р${ROUNDS + 1}`, 'победа'));
  console.log(`  очки броска: p10=${q(0.1)} p50=${q(0.5)} p90=${q(0.9)} p99=${q(0.99)} max=${all[all.length - 1]}`);
  console.log(`  джекпотов на забег: ${(jackpots / n).toFixed(2)}`);
}

function determinism(): boolean {
  let ok = true;
  for (let i = 0; i < 20; i++) {
    const a = play('DET' + i, 0.5);
    const b = play('DET' + i, 0.5);
    if (a.scores.join() !== b.scores.join() || a.run.total !== b.run.total) {
      ok = false;
      console.log('  РАСХОЖДЕНИЕ на сиде DET' + i);
    }
  }
  console.log(ok ? '\nдетерминизм: OK (20 сидов × 2 прогона, счёт совпал)' : '\nдетерминизм: ОШИБКА');
  return ok;
}

// targets=60,150,350,800 — попробовать другие пороги, не меняя код
const tArg = process.argv.find((a) => a.startsWith('targets='));
if (tArg) tArg.slice(8).split(',').forEach((v, i) => (TARGETS[i] = Number(v)));
const arg = process.argv.slice(2).find((a) => !a.startsWith('targets='));
if (arg === 'det') {
  process.exit(determinism() ? 0 : 1);
} else {
  const n = Number(arg) || 500;
  const t0 = Date.now();
  stats(n, 0);
  stats(n, 0.6);
  const ok = determinism();
  console.log(`время: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  process.exit(ok ? 0 : 1);
}
