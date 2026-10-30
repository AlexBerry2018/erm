// Запуск и цикл кадра.
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/roboto-condensed/700.css';
import './style.css';
import { Game } from './game';

const game = new Game();

// хук для e2e-тестов и отладки
(window as unknown as { __game: Game }).__game = game;

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
