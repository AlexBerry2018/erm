// E2E: собранная игра в Chromium на экранах телефона и ПК. Скриншоты → tests/shots/, 0 ошибок консоли.
// Запуск: npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite preview не запустился')), 15000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
});

const SCREENS = [
  { name: 'phone', width: 852, height: 393, mobile: true },
  { name: 'pc', width: 1366, height: 768, mobile: false },
];

let failed = false;
const browser = await chromium.launch();
try {
  for (const s of SCREENS) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, isMobile: s.mobile, hasTouch: s.mobile });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}${s.name}-1-title.png` });

    // старт с фиксированным сидом
    await page.fill('#seedIn', 'TEST1');
    await page.click('#startBtn');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}${s.name}-2-aim.png` });

    // настоящий тап/клик по доске
    const box = await page.locator('#board').boundingBox();
    const x = box.x + box.width * 0.47;
    const y = box.y + box.height * 0.3;
    if (s.mobile) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}${s.name}-3-throw.png` });

    // играем, пока не дойдём до выбора, конца или 40 бросков
    const g = (fn) => page.evaluate(fn);
    let shotOffer = false;
    let shotLayout = false;
    for (let i = 0; i < 400; i++) {
      const mode = await g(() => window.__game.mode);
      if (mode === 'aim') await g(() => window.__game.throwAt(120 + Math.floor(Math.random() * 240)));
      else if (mode === 'offer') {
        if (!shotOffer) { await page.screenshot({ path: `${SHOTS}${s.name}-4-offer.png` }); shotOffer = true; }
        await page.locator('.card').first().click();
      } else if (mode === 'layout') {
        if (!shotLayout) {
          // перетаскиваем первое окно
          const o = await g(() => window.__game.run.objs[0]);
          const v = await g(() => { const gm = window.__game; return gm.view; });
          const fx = box.x + v.ox + (o.x + 20) * v.s;
          const fy = box.y + v.oy + (o.y + 20) * v.s;
          await page.mouse.move(fx, fy);
          await page.mouse.down();
          await page.mouse.move(fx + 40 * v.s, fy + 10 * v.s, { steps: 5 });
          await page.screenshot({ path: `${SHOTS}${s.name}-5-layout.png` });
          await page.mouse.up();
          shotLayout = true;
        }
        await page.click('#go');
      } else if (mode === 'over') break;
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: `${SHOTS}${s.name}-6-end.png` });
    const st = await g(() => ({ mode: window.__game.mode, round: window.__game.run.round, peak: window.__game.run.peak }));
    console.log(`${s.name}: режим=${st.mode} раунд=${st.round} пик=${st.peak} ошибок консоли=${errors.length}`);
    if (errors.length) { failed = true; errors.forEach((e) => console.log('  ' + e)); }

    // портрет: должен появиться экран «поверни телефон»
    if (s.mobile) {
      await page.setViewportSize({ width: 393, height: 852 });
      await page.waitForTimeout(200);
      const vis = await page.locator('#rotate').isVisible();
      await page.screenshot({ path: `${SHOTS}${s.name}-7-portrait.png` });
      console.log(`  портрет: экран «поверни телефон» ${vis ? 'виден' : 'НЕ виден'}`);
      if (!vis) failed = true;
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? 'E2E: ОШИБКИ' : 'E2E: OK');
process.exit(failed ? 1 : 0);
