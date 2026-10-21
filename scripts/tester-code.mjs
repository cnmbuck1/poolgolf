// Prints the hash to put in src/playtest.config.ts (TESTER_CODE_HASH) for a new tester code.
// Usage: node scripts/tester-code.mjs NEWCODE    (letters and digits; spaces, dashes and case are ignored)
import { createHash } from 'node:crypto';
const code = (process.argv[2] ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
if (!code) { console.error('Usage: node scripts/tester-code.mjs NEWCODE'); process.exit(1); }
console.log(createHash('sha256').update(`rack-and-roll:${code}`).digest('hex'));
