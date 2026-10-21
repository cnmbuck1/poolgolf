// Where testers' scores and feedback are sent: the web app URL of the Google Apps Script in
// docs/playtest-sheet.gs (see docs/PLAYTESTING.md for the five-minute setup). Leave it empty to keep
// records on each device only. Note: this repository is public, so anyone could find this URL and post
// to the sheet; fine for a playtest, but don't put anything secret in it.
export const PLAYTEST_URL = 'https://script.google.com/macros/s/AKfycbwUFtzczLRXzoLnxEKemdWyMraB4UM-iEdg0bQKmSWjwgNb9cYX03OjBxbf0O-Jz-SC/exec';

/**
 * The tester code the web version asks for (on github.io and other hosts; never in the app, on claude.ai
 * or on localhost), stored as a hash so it can't be read straight from this public repository. Testers
 * type it once and the browser remembers it. To change it: `node scripts/tester-code.mjs NEWCODE` and
 * paste the result here; '' turns the gate off. This keeps out casual visitors, not determined ones.
 */
export const TESTER_CODE_HASH = '7b62433c2ce49f33ba23bd681377f6485af6a511ec1ab249f83c45e2826c833b';
