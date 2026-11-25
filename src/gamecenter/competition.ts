// Rack & Roll's use of Game Center: total stars and holes in one, the best round on each course, the daily
// challenge, and the trophy room as achievements. iPhone app only; everything here is a no-op elsewhere.
import { GameCenter, RankInfo } from './GameCenter';
import { ACHIEVEMENTS, BOARD, roundBoard } from './catalog';
import * as P from '../progress';

export const gc = new GameCenter();
/** Achievement progress already sent this launch, so only changes go out. */
const sent = new Map<string, number>();

/** Sign in a moment after launch (Game Center shows its own banner), then send what the player already has. */
export function startGameCenter() {
  if (!gc.supported) return;
  gc.onSignIn = () => void sendProgress();
  setTimeout(() => void gc.authenticate().then((ok) => { if (ok) void sendProgress(); }), 2500);
}

/** Total stars, holes in one and trophy progress. Called after each hole. */
export async function sendProgress() {
  if (!gc.available) return;
  void gc.submit([BOARD.stars], P.totalStars());
  const aces = P.counter('aces');
  if (aces > 0) void gc.submit([BOARD.aces], aces);
  const list = ACHIEVEMENTS.map((a) => {
    const t = P.TROPHIES.find((x) => x.id === a.trophy)!;
    const [have, goal] = t.progress();
    const percent = P.trophyDone(t) ? 100 : goal > 0 ? Math.min(100, Math.floor((100 * have) / goal)) : 0;
    return { id: a.id, percent };
  }).filter((a) => a.percent > 0 && sent.get(a.id) !== a.percent);
  if (await gc.report(list)) for (const a of list) sent.set(a.id, a.percent);
}

/** A finished round: its strokes go on the course's board. Resolves the player's standing there, if known. */
export async function submitRound(course: string, strokes: number): Promise<RankInfo | null> {
  if (!gc.available) return null;
  const id = roundBoard(course);
  if (!(await gc.submit([id], strokes))) return null;
  return gc.rank(id);
}

/** The day's challenge hole: strokes on the daily board. */
export function submitDaily(strokes: number) {
  if (gc.available) void gc.submit([BOARD.daily], strokes);
}

/** Apple's Game Center screen: all leaderboards, one course's board, or the achievements. */
export const showLeaderboards = (course?: string) => gc.show(course ? { leaderboardID: roundBoard(course) } : { state: 'leaderboards' });
export const showAchievements = () => gc.show({ state: 'achievements' });
