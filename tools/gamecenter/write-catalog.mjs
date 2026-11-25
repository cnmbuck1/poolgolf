// Writes tools/gamecenter/catalog.json from src/gamecenter/catalog.ts (run: npm run gamecenter:catalog).
import { build } from 'esbuild';
import { writeFileSync } from 'fs';
const out = await build({ entryPoints: ['src/gamecenter/catalog.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  loader: { '.glb': 'empty', '.png': 'empty', '.css': 'empty' }, define: { 'import.meta.env': '{}' }, logLevel: 'error' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const cat = mod.catalog();
const total = cat.achievements.reduce((a, x) => a + x.points, 0);
if (total > 1000) throw new Error(`Achievements add up to ${total} points; Game Center allows 1000`);
writeFileSync('tools/gamecenter/catalog.json', JSON.stringify(cat, null, 2) + '\n');
console.log(`${cat.boards.length} leaderboards, ${cat.achievements.length} achievements (${total} points)`);
