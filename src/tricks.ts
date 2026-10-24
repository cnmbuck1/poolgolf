// Trick shots: one-shot challenges in small arenas on each course's theme. Each one asks for the ball
// to drop with a single shot, sometimes off a number of cushions or using a kind of spin.
import { blob, COURSES, creek, LevelDef, Theme } from './levels';

export interface TrickRule {
  /** Walls, rails and obstacles the ball must touch before it drops. */
  banks?: number;
  /** Spin the shot must be struck with. */
  spin?: 'side' | 'draw';
}
export interface Trick { id: string; name: string; tip: string; reward: number; rule: TrickRule; level: LevelDef }

const arena = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const lv = (theme: Theme, name: string, l: Omit<LevelDef, 'name' | 'par' | 'theme'>): LevelDef => ({ name, par: 1, theme, ...l });

export const TRICKS: Trick[] = [
  {
    id: 'firstbank', name: 'First Bank', reward: 25, rule: { banks: 1 },
    tip: 'The wall blocks the straight line. Go over the top off the far rail.',
    level: lv('garden', 'First Bank', {
      tee: [200, 320], cup: [800, 320], outline: arena(80, 90, 920, 410),
      bars: [{ x: 500, y: 300, len: 220, angle: 90 }],
    }),
  },
  {
    id: 'swerve', name: 'Swerve', reward: 25, rule: { spin: 'side' },
    tip: 'Strike the cue ball left or right of centre on the spin pad to curve round the boulder.',
    level: lv('space', 'Swerve', {
      tee: [220, 250], cup: [780, 250], outline: arena(100, 110, 900, 390),
      rocks: [{ x: 500, y: 250, r: 44 }],
      craters: [{ x: 330, y: 160, r: 40 }],
    }),
  },
  {
    id: 'drawback', name: 'Draw Back', reward: 40, rule: { banks: 1, spin: 'draw' },
    tip: 'The cup is behind you. Hit the wall firmly with backspin and the ball comes back.',
    level: lv('jurassic', 'Draw Back', {
      tee: [420, 250], cup: [170, 250], outline: arena(80, 120, 920, 380),
      bars: [{ x: 640, y: 250, len: 170, angle: 90 }],
      rocks: [{ x: 600, y: 160, r: 18 }, { x: 600, y: 340, r: 18 }],
    }),
  },
  {
    id: 'windmill', name: 'Windmill Run', reward: 40, rule: {},
    tip: 'Time it so the ball slips between the sweeping arms.',
    level: lv('garden', 'Windmill Run', {
      tee: [160, 250], cup: [840, 250], outline: arena(80, 150, 920, 350),
      spinners: [{ x: 500, y: 215, len: 80, speed: 1.5, style: 'turnstile', arms: 1 }],
    }),
  },
  {
    id: 'needle', name: 'Thread the Needle', reward: 40, rule: {},
    tip: 'One small gap between the boulders. Line it up and hit it firm.',
    level: lv('jurassic', 'Thread the Needle', {
      tee: [150, 250], cup: [850, 250], outline: arena(80, 90, 920, 410),
      rocks: [{ x: 500, y: 203, r: 28 }, { x: 500, y: 297, r: 28 }],
      bars: [{ x: 500, y: 128, len: 80, angle: 90 }, { x: 500, y: 372, len: 80, angle: 90 }],
    }),
  },
  {
    id: 'moonshot', name: 'Moonshot', reward: 50, rule: {},
    tip: 'Two asteroids drift across the lane. Pick your moment.',
    level: lv('space', 'Moonshot', {
      tee: [130, 250], cup: [870, 250], outline: arena(60, 120, 940, 380),
      asteroids: [{ a: [370, 140], b: [370, 360], speed: 120, r: 26 }, { a: [630, 360], b: [630, 140], speed: 150, r: 26, phase: 0.3 }],
    }),
  },
  {
    id: 'doublebank', name: 'Double Bank', reward: 50, rule: { banks: 2 },
    tip: 'The cup hides behind a wall. Come at it from the far side.',
    level: lv('garden', 'Double Bank', {
      tee: [200, 250], cup: [800, 250], outline: arena(80, 90, 920, 410),
      bars: [{ x: 500, y: 250, len: 160, angle: 90 }, { x: 730, y: 250, len: 90, angle: 90 }],
    }),
  },
  {
    id: 'lavabridge', name: 'Lava Bridge', reward: 50, rule: {},
    tip: 'Only the bridge crosses the lava. Get the angle right.',
    level: lv('jurassic', 'Lava Bridge', {
      tee: [180, 330], cup: [820, 170], outline: arena(80, 90, 920, 410),
      water: [creek([[470, 60], [500, 180], [480, 300], [510, 440]], 90, 2)],
      bridges: [{ x: 492, y: 250, len: 170, width: 54, angle: -28 }],
      sand: [blob(700, 340, 50, 26, 3, 0.2)],
    }),
  },
  {
    id: 'threecushion', name: 'Three Cushions', reward: 75, rule: { banks: 3 },
    tip: 'Off three walls and in. Plan the route round the long wall.',
    level: lv('space', 'Three Cushions', {
      tee: [200, 160], cup: [800, 160], outline: arena(80, 90, 920, 410),
      bars: [{ x: 500, y: 190, len: 200, angle: 90 }],
    }),
  },
];

export const courseName = (t: Trick) => COURSES.find((c) => c.theme === t.level.theme)?.name ?? 'Practice green';

const key = (id: string) => `poolgolf.trick.${id}`;
export function isDone(t: Trick) { try { return localStorage.getItem(key(t.id)) === '1'; } catch { return false; } }
/** Mark a trick done; true the first time (the reward is paid once). */
export function markDone(t: Trick) {
  if (isDone(t)) return false;
  try { localStorage.setItem(key(t.id), '1'); } catch { /* ignore */ }
  return true;
}

/** Does a sunk shot meet the trick's rule? Returns the reason it doesn't, or null. */
export function checkRule(t: Trick, banks: number, spin: { side: number; vert: number }) {
  if (t.rule.spin === 'side' && Math.abs(spin.side) < 0.3) return 'Use side spin: drag the dot left or right on the spin pad.';
  if (t.rule.spin === 'draw' && spin.vert > -0.3) return 'Use backspin: drag the dot to the bottom of the spin pad.';
  if (t.rule.banks && banks < t.rule.banks) return `It needs ${t.rule.banks} bank${t.rule.banks > 1 ? 's' : ''} before it drops (you had ${banks}).`;
  return null;
}

export function ruleText(t: Trick) {
  const parts = ['Sink it in one shot'];
  if (t.rule.banks) parts.push(`off ${t.rule.banks} bank${t.rule.banks > 1 ? 's' : ''}`);
  if (t.rule.spin === 'side') parts.push('with side spin');
  if (t.rule.spin === 'draw') parts.push('with backspin');
  return parts.join(' ');
}
