/**
 * Rack & Roll playtest receiver: a Google Apps Script web app that writes testers' hole scores and
 * feedback into this spreadsheet. Setup steps are in docs/PLAYTESTING.md.
 *
 * Sheets (created on first use):
 *   Plays     one row per finished hole
 *   Feedback  one row per bug report, idea or "love it"
 *   Summary   average strokes per hole against par, worst holes first
 */
const PLAY_COLS = ['at', 'tester', 'testerName', 'course', 'hole', 'name', 'par', 'strokes', 'pickedUp', 'mode', 'seconds', 'build', 'platform', 'device', 'session'];
const FEEDBACK_COLS = ['at', 'tester', 'testerName', 'kind', 'text', 'course', 'hole', 'strokes', 'build', 'platform', 'device', 'session'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const body = JSON.parse(e.postData.contents);
    const records = Array.isArray(body.records) ? body.records.slice(0, 200) : [];
    const plays = sheet_('Plays', PLAY_COLS), feedback = sheet_('Feedback', FEEDBACK_COLS);
    const rows = { hole: [], feedback: [] };
    for (const r of records) {
      if (r.type === 'hole') rows.hole.push(PLAY_COLS.map((c) => clean_(r[c])));
      else if (r.type === 'feedback') rows.feedback.push(FEEDBACK_COLS.map((c) => clean_(r[c])));
    }
    if (rows.hole.length) plays.getRange(plays.getLastRow() + 1, 1, rows.hole.length, PLAY_COLS.length).setValues(rows.hole);
    if (rows.feedback.length) feedback.getRange(feedback.getLastRow() + 1, 1, rows.feedback.length, FEEDBACK_COLS.length).setValues(rows.feedback);
    summary_();
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

/** Plain values only, and never something a spreadsheet would run as a formula. */
function clean_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(cols);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  }
  return sh;
}

/** Average strokes per hole against par (the holes testers find hardest come first). */
function summary_() {
  const ss = SpreadsheetApp.getActive();
  if (ss.getSheetByName('Summary')) return;
  const sh = ss.insertSheet('Summary');
  sh.getRange('A1').setFormula(
    "=QUERY(Plays!A:O, \"select D, E, F, G, count(H), avg(H), avg(H) - avg(G) where H is not null group by D, E, F, G order by avg(H) - avg(G) desc " +
    "label D 'course', E 'hole #', F 'hole', G 'par', count(H) 'plays', avg(H) 'avg strokes', avg(H) - avg(G) 'vs par'\", 1)");
}
