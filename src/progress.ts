// Reasons to come back: hole stars (par, birdie, ace), a hidden golden 8-ball on every hole, and a trophy
// room of achievements that pay coins (two of them also win designs that can't be bought). Saved on this
// device only, separately from coins, so an economy reset keeps it.
import { ALL_COURSES, COURSES, Pt } from './levels';
import { Achievement } from './wallet';
import { streak } from './daily';

/** Where each hole's golden 8-ball hides, by course and hole name (picked to be reachable from the tee). */
export const EIGHTS: Record<string, Record<string, Pt>> = {
  halloween: {
    'Pumpkin Patch': [565, 125],
    'Graveyard Shift': [645, 325],
    "Witch's Flight": [655, 85],
    'Cauldron Bubble': [595, 385],
    'Bat Cave': [615, 155],
    'Haunted Mansion': [515, 105],
  },
  pirate: {
    'Walk the Plank': [420, 185],
    'Cannon Cove': [655, 325],
    'Rocking Deck': [90, 330],
    "Kraken's Lair": [690, 250],
    'Treasure Cave': [615, 155],
    "Captain's Quarters": [725, 345],
  },
  christmas: {
    'Jingle Bell Lane': [575, 125],
    'Snowball Alley': [615, 345],
    "Santa's Sleigh Ride": [655, 85],
    'Frozen Pond': [690, 340],
    'Chimney Drop': [615, 155],
    'Toy Train Express': [760, 400],
  },
  candy: {
    'Sugar Rush': [585, 155],
    'Candy Cane Ladder': [675, 415],
    'Chocolate Falls': [575, 235],
    'Gingerbread Lane': [565, 325],
    'Chutes & Ladders': [565, 165],
    'Cake Walk': [545, 325],
  },
  jurassic: {
    'Lava Run': [585, 105],
    'Tumbleweed Flats': [565, 395],
    'Bronto Crossing': [575, 125],
    "Rex's Lair": [605, 365],
    'Geyser Mesa': [735, 165],
    'Extinction': [585, 375],
  },
  space: {
    'Moonwalk': [575, 125],
    'Asteroid Belt': [575, 405],
    'Crater Hop': [765, 155],
    'Space Walk': [575, 375],
    'Close Encounters': [585, 115],
    'Lunar Landing': [815, 375],
  },
  circus: {
    'Center Ring': [575, 165],
    'Clown Alley': [575, 375],
    'Human Cannonball': [515, 355],
    'Bounce House': [605, 355],
    'Carousel': [575, 125],
    'Grand Finale': [585, 375],
  },
  tomb: {
    'Scarab Gate': [575, 125],
    'Quicksand Flats': [605, 345],
    'Hall of Doors': [805, 155],
    "Mummy's Curse": [565, 375],
    'Oasis': [445, 135],
    "Pharaoh's Chamber": [795, 375],
  },
  arctic: {
    'Snowfall': [575, 125],
    'Penguin Parade': [585, 175],
    'Ski Jump': [675, 95],
    'Polar Bear Pass': [575, 375],
    'Frozen Lake': [525, 115],
    'Northern Lights': [475, 375],
  },
};

/** Coins for each new hole star, and for picking up a golden 8-ball. */
export const STAR_COINS = 10;
export const EIGHT_COINS = 15;

interface Saved {
  stars: Record<string, number>; // `${course}/${hole name}` → 1..3
  eights: string[]; // `${course}/${hole name}` of the golden 8-balls found
  counts: Record<string, number>; // chutes, ladders, portals, banks, spin, backspin, aces
  launches: string[]; // kinds of launch ridden: cannon, seal, ramp, trampoline, rocket, geyser
  rounds: string[]; // courses with a finished round
  bestStreak: number;
  trophies: string[];
}

const KEY = 'poolgolf.progress';
const fresh = (): Saved => ({ stars: {}, eights: [], counts: {}, launches: [], rounds: [], bestStreak: 0, trophies: [] });
let s: Saved = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return fresh(); } })();
function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

const id = (course: string, hole: string) => `${course}/${hole}`;
const ALL_HOLES = COURSES.flatMap((c) => c.holes.map((l) => id(c.id, l.name)));
export const MAX_STARS = ALL_HOLES.length * 3;
export const EIGHT_TOTAL = ALL_HOLES.filter((h) => { const [c, n] = h.split('/'); return EIGHTS[c]?.[n]; }).length;

/** Stars a score is worth: ⭐ par, ⭐⭐ birdie or better, ⭐⭐⭐ hole in one. */
export const starsFor = (score: number, par: number) => (score === 1 ? 3 : score < par ? 2 : score === par ? 1 : 0);
export const starsOf = (course: string, hole: string) => s.stars[id(course, hole)] ?? 0;
export const courseStars = (course: string) => ALL_COURSES.find((c) => c.id === course)!.holes.reduce((a, l) => a + starsOf(course, l.name), 0);
export const totalStars = () => Object.values(s.stars).reduce((a, n) => a + n, 0);
/** Star row for a hole, e.g. ★★☆. */
export const starRow = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** Keep a hole's best stars; returns the stars for this score and how many are new. */
export function recordStars(course: string, hole: string, score: number, par: number) {
  const stars = starsFor(score, par), had = starsOf(course, hole);
  if (stars > had) { s.stars[id(course, hole)] = stars; save(); }
  return { stars, gained: Math.max(0, stars - had) };
}

export const eightAt = (course: string, hole: string): Pt | null => EIGHTS[course]?.[hole] ?? null;
export const eightFound = (course: string, hole: string) => s.eights.includes(id(course, hole));
/** Golden 8-balls found on one course, or on the six regular courses (holiday ones don't count toward the 36). */
export const eightsFound = (course?: string) => (course ? s.eights.filter((e) => e.startsWith(`${course}/`)).length : s.eights.filter((e) => COURSES.some((c) => e.startsWith(`${c.id}/`))).length);
/** Pick up a hole's golden 8-ball; returns how many have been found. */
export function takeEight(course: string, hole: string) {
  if (!eightFound(course, hole)) { s.eights.push(id(course, hole)); save(); }
  return s.eights.length;
}

export function bump(counter: string, n = 1) { s.counts[counter] = (s.counts[counter] ?? 0) + n; save(); }
const count = (k: string) => s.counts[k] ?? 0;
export function noteLaunch(by: string) { if (!s.launches.includes(by)) { s.launches.push(by); save(); } }
export function noteRound(course: string) { if (!s.rounds.includes(course)) { s.rounds.push(course); save(); } }

export interface Trophy {
  id: string;
  name: string;
  desc: string;
  coins: number;
  /** A design that comes with it (one that can't be bought). */
  item?: Achievement;
  /** Progress toward it: [have, goal]. */
  progress: () => [number, number];
}

const LAUNCH_KINDS = ['ramp', 'trampoline', 'cannon', 'seal', 'rocket', 'geyser'];
const parsAll = (course: string) => COURSES.find((c) => c.id === course)!.holes.filter((l) => starsOf(course, l.name) > 0).length;

export const TROPHIES: Trophy[] = [
  { id: 'par1', name: 'On the card', desc: 'Make par on any hole', coins: 15, progress: () => [Math.min(1, totalStars()), 1] },
  { id: 'birdie1', name: 'Early bird', desc: 'Make a birdie', coins: 25, progress: () => [Object.values(s.stars).some((n) => n >= 2) ? 1 : 0, 1] },
  { id: 'ace1', name: 'Hole in one', desc: 'Make a hole in one', coins: 75, progress: () => [Math.min(1, count('aces')), 1] },
  { id: 'aces5', name: 'Ace collector', desc: 'Make 5 holes in one', coins: 200, progress: () => [Math.min(5, count('aces')), 5] },
  { id: 'stars25', name: 'Rising star', desc: 'Earn 25 hole stars', coins: 100, progress: () => [Math.min(25, totalStars()), 25] },
  { id: 'stars54', name: 'Grand master', desc: 'Earn 54 hole stars', coins: 250, item: 'stars54', progress: () => [Math.min(54, totalStars()), 54] },
  { id: 'stars108', name: 'Perfectionist', desc: `Earn all ${MAX_STARS} hole stars`, coins: 1000, progress: () => [totalStars(), MAX_STARS] },
  ...COURSES.map((c): Trophy => ({ id: `pars.${c.id}`, name: `${c.name} regular`, desc: `A star on every hole of ${c.name}`, coins: 60,
    progress: () => [parsAll(c.id), c.holes.length] })),
  { id: 'eight1', name: 'Lucky eight', desc: 'Find a golden 8-ball', coins: 15, progress: () => [Math.min(1, eightsFound()), 1] },
  { id: 'eight12', name: 'Treasure hunter', desc: 'Find 12 golden 8-balls', coins: 100, progress: () => [Math.min(12, eightsFound()), 12] },
  { id: 'eightAll', name: 'Golden touch', desc: `Find all ${EIGHT_TOTAL} golden 8-balls`, coins: 300, item: 'allEights', progress: () => [eightsFound(), EIGHT_TOTAL] },
  { id: 'globe', name: 'Globetrotter', desc: 'Finish a round on every course', coins: 150, progress: () => [s.rounds.filter((c) => COURSES.some((k) => k.id === c)).length, COURSES.length] },
  { id: 'flyer', name: 'Frequent flyer', desc: 'Get launched by a ramp, trampoline, cannon, seal, rocket and geyser', coins: 150,
    progress: () => [LAUNCH_KINDS.filter((k) => s.launches.includes(k)).length, LAUNCH_KINDS.length] },
  { id: 'chutes', name: 'Snakes & ladders', desc: 'Ride 20 chutes, slides, ladders or lifts', coins: 60, progress: () => [Math.min(20, count('chutes') + count('ladders')), 20] },
  { id: 'portals', name: 'Wormhole', desc: 'Go through a portal or igloo 15 times', coins: 50, progress: () => [Math.min(15, count('portals')), 15] },
  { id: 'banks', name: 'Bank on it', desc: 'Sink 25 bank shots', coins: 100, progress: () => [Math.min(25, count('banks')), 25] },
  { id: 'spin', name: 'English lesson', desc: 'Sink 10 shots hit with side spin', coins: 75, progress: () => [Math.min(10, count('spin')), 10] },
  { id: 'draw', name: 'Draw shot', desc: 'Sink 5 shots hit with backspin', coins: 60, progress: () => [Math.min(5, count('backspin')), 5] },
  { id: 'streak7', name: 'Regular', desc: 'Keep a 7-day daily challenge streak', coins: 150, progress: () => [Math.min(7, s.bestStreak), 7] },
];

export const trophyDone = (t: Trophy) => s.trophies.includes(t.id);
export const trophiesWon = () => s.trophies.length;

/** Newly earned trophies (marked won; the caller pays their coins and designs). */
export function checkTrophies() {
  s.bestStreak = Math.max(s.bestStreak, streak());
  const won = TROPHIES.filter((t) => { if (trophyDone(t)) return false; const [h, g] = t.progress(); return h >= g; });
  if (won.length) { s.trophies.push(...won.map((t) => t.id)); save(); }
  return won;
}
