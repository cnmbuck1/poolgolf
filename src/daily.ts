// Daily challenge: one challenge per calendar day, the same for every player (picked from the date).
// It alternates between holes from the courses and trick shots, and keeps a streak of days completed.
// Saved on this device.
import { COURSES, LevelDef } from './levels';
import { Trick, TRICKS } from './tricks';

export type Daily =
  | { kind: 'hole'; day: number; course: string; hole: number; level: LevelDef; goal: number; goalName: string }
  | { kind: 'trick'; day: number; trick: Trick };

/** Coins for completing the day's challenge, plus a bonus per day of streak (capped). */
export const DAILY_COINS = 20;
const STREAK_COINS = 5, STREAK_CAP = 10;

/** Days since 1 Jan 1970 in the player's own time zone, so the challenge changes at local midnight. */
export function today(now = new Date()) {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}
export const dateLabel = (day: number) => new Date(day * 86400000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Entry = { kind: 'hole'; course: string; hole: number } | { kind: 'trick'; id: string };
const POOL: Entry[] = [
  ...COURSES.flatMap((c) => c.holes.map((_, i) => ({ kind: 'hole' as const, course: c.id, hole: i }))),
  ...TRICKS.map((t) => ({ kind: 'trick' as const, id: t.id })),
];

/** The challenge for a day: every entry comes up once per cycle, in a fresh order each cycle. */
export function dailyFor(day: number): Daily {
  const n = POOL.length, cycle = Math.floor(day / n);
  const order = POOL.map((_, i) => i);
  const r = rng(cycle * 7919 + 17);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const e = POOL[order[((day % n) + n) % n]];
  if (e.kind === 'trick') return { kind: 'trick', day, trick: TRICKS.find((t) => t.id === e.id)! };
  const level = COURSES.find((c) => c.id === e.course)!.holes[e.hole];
  // Every third day asks for a birdie instead of par
  const birdie = day % 3 === 0;
  return { kind: 'hole', day, course: e.course, hole: e.hole, level, goal: level.par - (birdie ? 1 : 0), goalName: birdie ? 'Birdie or better' : 'Par or better' };
}

export const dailyName = (d: Daily) => (d.kind === 'trick' ? d.trick.name : d.level.name);
export const dailyCourse = (d: Daily) => COURSES.find((c) => c.theme === (d.kind === 'trick' ? d.trick.level.theme : d.level.theme))?.name ?? '';

const key = (k: string) => `poolgolf.daily.${k}`;
function get(k: string) { try { return localStorage.getItem(key(k)); } catch { return null; } }
function set(k: string, v: string) { try { localStorage.setItem(key(k), v); } catch { /* ignore */ } }

export const isDoneToday = (d: Daily) => get('last') === String(d.day);
export const bestToday = (d: Daily) => { const v = get(`best.${d.day}`); return v == null ? null : Number(v); };

/** Current streak: days in a row completed, still alive if the last one was today or yesterday. */
export function streak(day = today()) {
  const last = Number(get('last') ?? -9);
  return last >= day - 1 ? Number(get('streak') ?? 0) : 0;
}

/**
 * Record a finished attempt (a hole's score, or a trick made in `attempts` tries). Returns whether it met
 * the goal, whether this was the first completion today, the streak, and the coin lines for it.
 */
export function recordDaily(d: Daily, score: number) {
  if (d.kind === 'hole') {
    const best = bestToday(d);
    if (best == null || score < best) set(`best.${d.day}`, String(score));
  }
  const met = d.kind === 'trick' || score <= d.goal;
  const first = met && !isDoneToday(d);
  const coins: [string, number][] = [];
  if (first) {
    const s = Number(get('last') ?? -9) === d.day - 1 ? Number(get('streak') ?? 0) + 1 : 1;
    set('streak', String(s));
    set('last', String(d.day));
    set('best.streak', String(Math.max(s, Number(get('best.streak') ?? 0))));
    coins.push(['Daily challenge', DAILY_COINS]);
    if (s > 1) coins.push([`${s}-day streak`, Math.min(s - 1, STREAK_CAP) * STREAK_COINS]);
  }
  return { met, first, streak: streak(d.day), coins };
}

export const bestStreak = () => Number(get('best.streak') ?? 0);

/** "5h 12m" until the next challenge. */
export function untilTomorrow(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const m = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
