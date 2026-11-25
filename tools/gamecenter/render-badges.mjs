// Draws the 512x512 achievement badges App Store Connect needs (one per achievement) into
// tools/gamecenter/badges/, from catalog.json. Run: npm run gamecenter:badges (needs Playwright).
import { createRequire } from 'module';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const { achievements } = JSON.parse(readFileSync(join(here, 'catalog.json'), 'utf8'));
// [ball colour, big glyph, small label]. Each badge is a pool ball on felt.
const STYLE = {
  par1: ['#f5c400', 'PAR'], birdie1: ['#1f5fd6', '🐦'], ace1: ['#d62828', '1', 'ACE'], aces5: ['#d62828', '5', 'ACES'],
  stars25: ['#f5c400', '★', '25'], stars54: ['#f5c400', '★', '54'], stars108: ['#f5c400', '★', '108'],
  pars_candy: ['#ff5fb0', '🍭'], pars_jurassic: ['#2f9e44', '🦖'], pars_space: ['#6b3fd6', '🚀'], pars_circus: ['#e8590c', '🎪'],
  pars_tomb: ['#c99a2e', '🏺'], pars_arctic: ['#4dabf7', '❄'],
  eight1: ['#111111', '8'], eight12: ['#111111', '8', '×12'], eightAll: ['#111111', '8', 'ALL'],
  globe: ['#1c7ed6', '🌍'], flyer: ['#e03131', '✈'], chutes: ['#7048e8', '⤵', 'CHUTES'], portals: ['#9c36b5', '◎'],
  banks: ['#0b7285', '⟋', 'BANKS'], spin: ['#e8590c', '↻', 'SPIN'], draw: ['#5f3dc4', '↶', 'DRAW'], streak7: ['#f76707', '🔥', '7'],
};
const out = join(here, 'badges');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent('<canvas id="c" width="512" height="512"></canvas>');
for (const a of achievements) {
  const key = a.id.replace('rackandroll.ach.', '');
  const [color, glyph, sub] = STYLE[key] ?? ['#f5c400', '★'];
  const png = await page.evaluate(({ color, glyph, sub }) => {
    const c = document.getElementById('c');
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    // Felt
    const felt = g.createRadialGradient(256, 230, 30, 256, 256, 330);
    felt.addColorStop(0, '#1f8a55'); felt.addColorStop(1, '#063b22');
    g.fillStyle = felt; g.fillRect(0, 0, 512, 512);
    // Neon rim
    g.shadowColor = '#7dffb8'; g.shadowBlur = 30; g.strokeStyle = '#b8ffd8'; g.lineWidth = 10;
    g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.stroke();
    g.shadowBlur = 0;
    // Ball, with a shadow and a highlight
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(266, 400, 140, 34, 0, 0, Math.PI * 2); g.fill();
    const ball = g.createRadialGradient(210, 190, 20, 256, 256, 190);
    ball.addColorStop(0, '#ffffff'); ball.addColorStop(0.18, color); ball.addColorStop(1, '#000000');
    g.fillStyle = ball; g.beginPath(); g.arc(256, 250, 170, 0, Math.PI * 2); g.fill();
    // White spot
    g.fillStyle = '#fbf7ec'; g.beginPath(); g.arc(256, 250, 92, 0, Math.PI * 2); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#111';
    const font = '"Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",-apple-system,"Helvetica Neue",Arial,sans-serif';
    const emoji = /\p{Extended_Pictographic}/u.test(glyph);
    const size = glyph.length > 2 && !emoji ? 64 : sub ? 84 : 104;
    g.font = `900 ${size}px ${font}`;
    g.fillText(glyph, 256, sub ? 226 : 256);
    if (sub) { g.font = `900 ${sub.length > 3 ? 34 : 44}px -apple-system,"Helvetica Neue",Arial,sans-serif`; g.fillStyle = '#333'; g.fillText(sub, 256, 300); }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(190, 150, 34, 20, -0.6, 0, Math.PI * 2); g.fill();
    return c.toDataURL('image/png');
  }, { color, glyph, sub });
  writeFileSync(join(out, `${key}.png`), Buffer.from(png.split(',')[1], 'base64'));
}
await browser.close();
console.log(`${achievements.length} badges in ${out}`);
