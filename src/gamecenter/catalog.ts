// Every Game Center leaderboard and achievement, in one place: the game reads the IDs from here, and
// tools/gamecenter/catalog.json (written from this by `npm run gamecenter:catalog`) is what the
// "Set up Game Center" workflow creates in App Store Connect. IDs can never change or be reused once created.
import { ALL_COURSES } from '../levels';
import { TROPHIES } from '../progress';

const P = 'rackandroll';

export interface Board { id: string; name: string; format: 'INTEGER'; sort: 'ASC' | 'DESC'; recurring?: { start: string; days: number } }
export interface Ach { id: string; name: string; points: number; goal: string; earned: string; trophy: string }

/** Best full round on each course (strokes, lower is better). */
export const roundBoard = (course: string) => `${P}.round.${course}`;
export const BOARD = { stars: `${P}.total_stars`, aces: `${P}.holes_in_one`, daily: `${P}.daily_challenge` };

export const BOARDS: Board[] = [
  { id: BOARD.stars, name: 'Total Stars', format: 'INTEGER', sort: 'DESC' },
  { id: BOARD.aces, name: 'Holes in One', format: 'INTEGER', sort: 'DESC' },
  // A new board every day (from 00:00 UTC): fewest strokes on the day's challenge hole
  { id: BOARD.daily, name: 'Daily Challenge', format: 'INTEGER', sort: 'ASC', recurring: { start: '2026-12-01T00:00:00Z', days: 1 } },
  ...ALL_COURSES.map((c): Board => ({ id: roundBoard(c.id), name: `Best Round · ${c.name}`, format: 'INTEGER', sort: 'ASC' })),
];

/** Game Center points for a trophy, from its coin reward (Game Center allows 1000 points in all). */
const points = (coins: number) => (coins >= 1000 ? 100 : coins >= 300 ? 70 : coins >= 250 ? 60 : coins >= 200 ? 50 : coins >= 150 ? 40 : coins >= 100 ? 30 : coins >= 75 ? 25 : coins >= 50 ? 20 : coins >= 25 ? 15 : 10);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + '.';
const past = (desc: string) => `Earned: ${desc}.`;

/** One achievement per trophy in the trophy room. */
export const ACHIEVEMENTS: Ach[] = TROPHIES.map((t) => ({
  id: `${P}.ach.${t.id.replace(/\./g, '_')}`,
  name: t.name,
  points: points(t.coins),
  goal: sentence(t.desc),
  earned: past(t.desc),
  trophy: t.id,
}));

export const catalog = () => ({ boards: BOARDS, achievements: ACHIEVEMENTS.map(({ trophy: _t, ...a }) => a) });
