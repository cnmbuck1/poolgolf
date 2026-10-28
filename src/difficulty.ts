// Three levels of play. Everyone starts on Amateur, with every aid; the game offers the next level once a
// player has shown they're ready (never forces it), and Settings can change it any time. The levels take
// aids away rather than changing the holes, and pay a coin bonus for playing without them.
import type { GuideMode } from './render3d';

export type Skill = 'amateur' | 'intermediate' | 'pro';
export interface SkillDef {
  name: string;
  /** The aim guide: Amateur's follows the Settings switch; Intermediate shows up to the first bank; Pro, just a short line. */
  guide: GuideMode | null;
  /** The spin guide bends the dots with the swerve. */
  spinPreview: boolean;
  /** Slope arrows on the turf (Amateur and Intermediate follow the Settings switch). */
  arrows: boolean;
  /** A stricter cup: a fast ball lips out more. */
  strictCup: boolean;
  /** Extra coins on each hole and round, as a fraction. */
  bonus: number;
  /** What changes, for the Settings and level-up cards. */
  points: string[];
}

export const SKILLS: Record<Skill, SkillDef> = {
  amateur: {
    name: 'Amateur', guide: null, spinPreview: true, arrows: true, strictCup: false, bonus: 0,
    points: ['The full aim guide, showing two banks off the rails', 'Slope arrows and the spin curve'],
  },
  intermediate: {
    name: 'Intermediate', guide: 'one', spinPreview: true, arrows: true, strictCup: false, bonus: 0.25,
    points: ['The aim guide shows the path <b>up to the first bank</b> only', 'Slope arrows and the spin curve stay', '<b>+25% coins</b> on every hole and round'],
  },
  pro: {
    name: 'Pro', guide: 'line', spinPreview: false, arrows: false, strictCup: true, bonus: 0.5,
    points: ['Just a <b>short aiming line</b>: no path, no banks, no spin curve', '<b>No slope arrows</b>: read the greens yourself', 'A <b>stricter cup</b>: a fast ball lips out', '<b>+50% coins</b>, and a PRO badge on your scores'],
  },
};
export const ORDER: Skill[] = ['amateur', 'intermediate', 'pro'];

const get = (k: string) => { try { return localStorage.getItem(`poolgolf.${k}`); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(`poolgolf.${k}`, v); } catch { /* ignore */ } };

export const skill = (): Skill => { const s = get('skill'); return s === 'intermediate' || s === 'pro' ? s : 'amateur'; };
export function setSkill(s: Skill) {
  set('skill', s);
  set('skill.good', '0');
  try { localStorage.removeItem(`poolgolf.skill.need.${s}`); } catch { /* ignore */ }
}

/**
 * After a finished round: count it toward the next level and say whether to offer it. Amateur → Intermediate
 * after 2 rounds at par or better; Intermediate → Pro after 3 rounds under par. Saying "not now" asks again
 * after 3 more such rounds.
 */
export function noteRound(toPar: number): Skill | null {
  const now = skill();
  if (now === 'pro') return null;
  const good = now === 'amateur' ? toPar <= 0 : toPar < 0;
  if (!good) return null;
  const n = Number(get('skill.good') ?? 0) + 1;
  set('skill.good', String(n));
  const need = Number(get(`skill.need.${now}`) ?? (now === 'amateur' ? 2 : 3));
  return n >= need ? ORDER[ORDER.indexOf(now) + 1] : null;
}
/** "Not now": ask again after three more qualifying rounds. */
export function snooze() { const now = skill(); set(`skill.need.${now}`, String(Number(get('skill.good') ?? 0) + 3)); }
