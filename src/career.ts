// Career mode: three tours of three events, one event per course. Each event asks for a round at or
// under a target score; beating it by more earns extra stars. Progress is saved on this device.
import { COURSES } from './levels';

export interface Tier { id: string; name: string; toPar: number; reward: number }
export interface CareerEvent { id: string; tier: Tier; course: string; name: string; target: number; reward: number }

export const TIERS: Tier[] = [
  { id: 'amateur', name: 'Amateur Tour', toPar: 3, reward: 100 },
  { id: 'pro', name: 'Pro Tour', toPar: 0, reward: 200 },
  { id: 'champion', name: 'Champions Tour', toPar: -3, reward: 400 },
];

const NAMES: Record<string, Record<string, string>> = {
  amateur: { garden: 'Garden Club Classic', jurassic: 'Canyon Open', space: 'Lunar Invitational', circus: 'Big Top Open', tomb: 'Desert Classic', arctic: 'Snowball Open' },
  pro: { garden: 'Garden Masters', jurassic: 'Jurassic Championship', space: 'Moon Cup', circus: 'Ringmaster Classic', tomb: 'Valley of the Kings', arctic: 'Glacier Cup' },
  champion: { garden: 'Royal Garden Trophy', jurassic: 'Extinction Event', space: 'Galactic Grand Slam', circus: 'Greatest Show Trophy', tomb: "Pharaoh's Crown", arctic: 'Polar Crown' },
};

/** Beat the target by this many strokes for a second and third star. */
const STAR_STEPS = [0, 2, 4];
/** Coins for each star earned for the first time. */
export const STAR_COINS = 25;

export const EVENTS: CareerEvent[] = TIERS.flatMap((tier) => COURSES.map((c) => {
  const par = c.holes.reduce((a, l) => a + l.par, 0);
  return { id: `${tier.id}.${c.id}`, tier, course: c.id, name: NAMES[tier.id][c.id] ?? `${c.name} ${tier.name}`, target: par + tier.toPar, reward: tier.reward };
}));

const key = (k: string) => `poolgolf.career.${k}`;
function get(k: string) { try { return localStorage.getItem(key(k)); } catch { return null; } }
function set(k: string, v: string) { try { localStorage.setItem(key(k), v); } catch { /* ignore */ } }

/** Stars for a round score in an event (0 = missed the target). */
export function starsFor(ev: CareerEvent, score: number) {
  return STAR_STEPS.filter((s) => score <= ev.target - s).length;
}
export const bestStars = (ev: CareerEvent) => Number(get(`${ev.id}.stars`) ?? 0);
export const bestScore = (ev: CareerEvent) => { const v = get(`${ev.id}.best`); return v == null ? null : Number(v); };
export const totalStars = () => EVENTS.reduce((a, ev) => a + bestStars(ev), 0);

/** A tour opens once every event in the tour before it is cleared; within a tour, events open in order. */
export function isUnlocked(ev: CareerEvent) {
  const t = TIERS.indexOf(ev.tier);
  if (t > 0 && EVENTS.filter((e) => e.tier === TIERS[t - 1]).some((e) => bestStars(e) === 0)) return false;
  const inTier = EVENTS.filter((e) => e.tier === ev.tier);
  const i = inTier.indexOf(ev);
  return i === 0 || bestStars(inTier[i - 1]) > 0;
}

/** Record a finished round; returns the stars, what was newly earned, and the coin lines for it. */
export function recordEvent(ev: CareerEvent, score: number) {
  const stars = starsFor(ev, score);
  const before = bestStars(ev);
  const firstClear = before === 0 && stars > 0;
  const newStars = Math.max(0, stars - before);
  if (stars > before) set(`${ev.id}.stars`, String(stars));
  const best = bestScore(ev);
  if (best == null || score < best) set(`${ev.id}.best`, String(score));
  // Did this clear open the next tour?
  const t = TIERS.indexOf(ev.tier);
  const tourDone = firstClear && t < TIERS.length - 1 && EVENTS.filter((e) => e.tier === ev.tier).every((e) => bestStars(e) > 0);
  const coins: [string, number][] = [];
  if (firstClear) coins.push(['Event cleared', ev.reward]);
  if (newStars) coins.push([newStars === 1 ? 'New star' : `${newStars} new stars`, newStars * STAR_COINS]);
  return { stars, firstClear, newStars, coins, opened: tourDone ? TIERS[t + 1] : null };
}

export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
