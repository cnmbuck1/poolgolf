// "Beat my score" challenges: a link carrying a course (and hole), a score and a name. Opening it starts
// the same hole or round with the score to beat; the result can be sent straight back. Everything travels
// in the link, so there's no server.
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

export interface Challenge {
  /** One hole of a course, or a whole round of it. */
  kind: 'hole' | 'round';
  course: string;
  /** Hole index (0-based) for a hole challenge. */
  hole: number;
  score: number;
  name: string;
}

/** Where the game is played on the web; challenge links open here (with or without the app installed). */
export const PLAY_URL = 'https://cnmbuck1.github.io/poolgolf/';

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function challengeLink(c: Challenge) {
  const code = b64url(JSON.stringify([1, c.kind === 'hole' ? 'h' : 'r', c.course, c.hole, c.score, c.name.slice(0, 20)]));
  return `${PLAY_URL}?c=${code}`;
}

/** The challenge in this page's address, if any (checked against the courses the game has). */
export function challengeFromUrl(courses: { id: string; holes: unknown[] }[]): Challenge | null {
  try {
    const code = new URLSearchParams(location.search).get('c');
    if (!code) return null;
    const [v, k, course, hole, score, name] = JSON.parse(unb64url(code));
    const c = courses.find((x) => x.id === course);
    if (v !== 1 || !c || (k !== 'h' && k !== 'r')) return null;
    if (!Number.isInteger(hole) || hole < 0 || hole >= c.holes.length || !Number.isInteger(score) || score < 1 || score > 99) return null;
    return { kind: k === 'h' ? 'hole' : 'round', course, hole, score, name: String(name ?? '').slice(0, 20) || 'A friend' };
  } catch { return null; }
}

/** Take the challenge out of the address bar, so a reload doesn't start it again. */
export function clearChallengeUrl() {
  try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* ignore */ }
}

/** Open the share sheet with the link (or copy it where sharing isn't available). Returns how it went. */
export async function shareChallenge(text: string, url: string): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    if (Capacitor.isNativePlatform()) { await Share.share({ title: 'Rack & Roll challenge', text, url }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title: 'Rack & Roll challenge', text, url }); return 'shared'; }
  } catch { return 'cancelled'; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); return 'copied'; } catch { /* no clipboard */ }
  window.prompt('Copy this link and send it to a friend:', url);
  return 'copied';
}
