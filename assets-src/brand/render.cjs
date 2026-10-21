// Renders the Rack & Roll app icons and splash screens from brand.html into the iOS and Android projects.
// Usage: node assets-src/brand/render.cjs   (needs Playwright with Chromium, and Python 3 with Pillow)
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'out');
require('fs').mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const shot = async (kind, w, h, file) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`file://${__dirname}/brand.html?kind=${kind}&w=${w}&h=${h}`);
    await p.waitForSelector('body[data-ready]');
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(out, file), omitBackground: true });
    await p.close();
  };
  await shot('icon', 1024, 1024, 'icon.png');
  await shot('fg', 432, 432, 'fg.png');
  await shot('splash', 2732, 2732, 'splash-square.png');
  await shot('splash', 1920, 1280, 'splash-land.png');
  await shot('splash', 1280, 1920, 'splash-port.png');
  await b.close();
  execFileSync('python3', [path.join(__dirname, 'place.py'), out, root], { stdio: 'inherit' });
})();
