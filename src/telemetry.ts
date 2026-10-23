// Playtesting: every finished hole and every piece of feedback is recorded with a little context (which
// hole, which build, which kind of device), so testers' scores show which holes are too hard or too easy.
// Records go to up to three places:
//   - this device (always), for the in-game Playtest screen;
//   - a Google Sheet, when PLAYTEST_URL is set (see docs/PLAYTESTING.md), from any browser or the app;
//   - the claude.ai artifact's database, when the game is opened there by someone who can write to it.
// No names unless a tester types one, no location, nothing else.
import { Capacitor } from '@capacitor/core';
import { PLAYTEST_URL } from './playtest.config';

declare const __BUILD__: string;
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

export interface HoleRecord { type: 'hole'; course: string; hole: number; name: string; par: number; strokes: number; mode: string; seconds: number; pickedUp: boolean }
export interface FeedbackRecord { type: 'feedback'; kind: 'bug' | 'idea' | 'love'; text: string; course: string; hole: number; strokes: number }
/** An unexpected error in the game, with where the player was ('menu' when not on a hole). */
export interface ErrorRecord { type: 'error'; message: string; stack: string; course: string; hole: number; name: string; phase: string; mode: string; screen: string }
type Common = { tester: string; testerName: string; session: string; build: string; platform: string; device: string; at: string };
export type PlaytestRecord = (HoleRecord | FeedbackRecord | ErrorRecord) & Common;

const KEY = 'poolgolf.playtest', OUTBOX = 'poolgolf.playtest.outbox';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } };
const rid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** An anonymous id per device, kept across visits, so one tester's plays can be told apart. */
const tester = get('poolgolf.tester') ?? (() => { const id = rid().slice(0, 8); put('poolgolf.tester', id); return id; })();
const session = rid().slice(0, 8);
export const testerName = () => get('poolgolf.testerName') ?? '';
export const setTesterName = (n: string) => put('poolgolf.testerName', n.trim().slice(0, 40));
/** Whether finished holes are sent off the device (Settings → Share anonymous play stats). Feedback is always sent: the player chose to. */
export const sharing = () => get('poolgolf.share') !== '0';
export function setSharing(on: boolean) {
  put('poolgolf.share', on ? '1' : '0');
  // Turning it off also drops finished holes still waiting to be sent (feedback the player wrote still goes)
  if (!on) put(OUTBOX, JSON.stringify(readLocal(OUTBOX).filter((r) => r.type !== 'hole')));
}

function device() {
  const ua = navigator.userAgent;
  const kind = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : '';
  return `${kind}${browser ? ' ' + browser : ''} ${screen.width}x${screen.height}`;
}

const readLocal = (k: string): PlaytestRecord[] => { try { return JSON.parse(get(k) ?? '[]'); } catch { return []; } };

/** Record one event everywhere it can go. Never throws, never blocks play. */
export function track(rec: HoleRecord | FeedbackRecord | ErrorRecord) {
  const full = { ...rec, tester, testerName: testerName(), session, build: BUILD, platform: Capacitor.getPlatform(), device: device(), at: new Date().toISOString() } as PlaytestRecord;
  const local = readLocal(KEY);
  local.push(full);
  put(KEY, JSON.stringify(local.slice(-500)));
  if (rec.type !== 'feedback' && !sharing()) return;
  if (PLAYTEST_URL) { const out = readLocal(OUTBOX); out.push(full); put(OUTBOX, JSON.stringify(out.slice(-200))); void flush(); }
  void toArtifact(full);
}

/** Send queued records to the sheet (kept until the request goes out, so an offline round arrives later). */
let flushing = false;
export async function flush() {
  if (!PLAYTEST_URL || flushing) return;
  const out = readLocal(OUTBOX);
  if (!out.length) return;
  flushing = true;
  try {
    // text/plain keeps it a "simple" request a Google Apps Script web app accepts from any page
    await fetch(PLAYTEST_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ records: out }), keepalive: true });
    put(OUTBOX, JSON.stringify(readLocal(OUTBOX).slice(out.length)));
  } catch { /* offline: try again on the next record or launch */ } finally { flushing = false; }
}

// ---------- automatic error reports ----------

/**
 * Report unexpected errors (and a lost WebGL context) with where the player was, so bugs nobody writes in
 * about still show up on the playtest sheet. At most five different errors a session, each once.
 * Returns a reporter for errors the game catches itself.
 */
export function watchErrors(where: () => Omit<ErrorRecord, 'type' | 'message' | 'stack' | 'screen'>) {
  const seen = new Set<string>();
  const report = (message: string, stack = '') => {
    message = String(message || 'Unknown error').slice(0, 500);
    if (message === 'Script error.' || message.startsWith('ResizeObserver loop')) return; // browser noise with no detail
    if (seen.has(message) || seen.size >= 5) return;
    seen.add(message);
    let ctx: Omit<ErrorRecord, 'type' | 'message' | 'stack' | 'screen'> = { course: 'menu', hole: 0, name: '', phase: '', mode: '' };
    try { ctx = where(); } catch { /* report what we have */ }
    const lines = String(stack).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);
    try {
      track({ type: 'error', message, stack: lines.join(' | ').slice(0, 1500), ...ctx, screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}` });
    } catch { /* never let reporting break the game */ }
  };
  window.addEventListener('error', (e) => report(e.message || String(e.error), e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason as { message?: string; stack?: string } | undefined; report(r?.message ?? String(r), r?.stack); });
  return report;
}

// ---------- the claude.ai artifact's database (when the game is opened there) ----------

type Db = { collection(p: string): { add(d: Record<string, unknown>): Promise<unknown>; orderBy(f: string, d?: string): { limit(n: number): { get(): Promise<{ docs: { data(): Record<string, unknown> | undefined }[] }> } } } };
type User = { isOwner(): boolean; can(n: string): boolean | null };
type ClaudeHost = { use(name: string): Promise<unknown> };
const host = () => (window as unknown as { claude?: ClaudeHost }).claude;
let dbP: Promise<{ db: Db | null; user: User | null }> | null = null;
function artifactDb() {
  dbP ??= (async () => {
    const c = host();
    if (!c?.use) return { db: null, user: null };
    const [db, user] = await Promise.all([c.use('db') as Promise<Db | null>, c.use('user') as Promise<User | null>]);
    return { db, user };
  })().catch(() => ({ db: null, user: null }));
  return dbP;
}
let dbWritable = true;
async function toArtifact(rec: PlaytestRecord) {
  if (!dbWritable) return;
  const { db, user } = await artifactDb();
  if (!db || user?.can('data.write') === false) return;
  try { await db.collection({ hole: 'plays', feedback: 'feedback', error: 'errors' }[rec.type]).add(rec as unknown as Record<string, unknown>); } catch { dbWritable = false; }
}

/**
 * Records for the Playtest screen: everyone's, from the artifact's database, when the owner opens the game
 * on claude.ai; otherwise this device's own.
 */
export async function loadRecords(): Promise<{ records: PlaytestRecord[]; everyone: boolean }> {
  const { db, user } = await artifactDb();
  if (db && user?.isOwner()) {
    try {
      const lists = await Promise.all(['plays', 'feedback', 'errors'].map((c) => db.collection(c).orderBy('at', 'desc').limit(1000).get().catch(() => ({ docs: [] }))));
      const records = lists.flatMap((l) => l.docs).map((d) => d.data() as unknown as PlaytestRecord);
      return { records, everyone: true };
    } catch { /* fall back to this device */ }
  }
  return { records: readLocal(KEY), everyone: false };
}

/** Per-hole averages: how many plays, average strokes and how far that is from par. */
export function summarize(records: PlaytestRecord[]) {
  const holes = new Map<string, { course: string; hole: number; name: string; par: number; n: number; sum: number; picked: number }>();
  for (const r of records) {
    if (r.type !== 'hole') continue;
    const k = `${r.course}:${r.hole}`;
    const h = holes.get(k) ?? { course: r.course, hole: r.hole, name: r.name, par: r.par, n: 0, sum: 0, picked: 0 };
    h.n++; h.sum += r.strokes; if (r.pickedUp) h.picked++;
    holes.set(k, h);
  }
  const testers = new Set(records.map((r) => r.tester)).size;
  return { holes: [...holes.values()].map((h) => ({ ...h, avg: h.sum / h.n, diff: h.sum / h.n - h.par })), testers };
}
