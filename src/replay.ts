// Shot replays. While a shot rolls, every physics frame is recorded: the ball, the world clock (which
// poses the moving obstacles) and the spinner angles, plus the hits. Playback feeds those back into the
// world, so the replay shows exactly what happened, at any speed.
import { Event, World } from './physics';

export interface ShotFrame { t: number; x: number; y: number; vx: number; vy: number; spin: number[]; events: Event[] }
export interface Shot { frames: ShotFrame[]; dir: [number, number]; power: number; end: 'sink' | 'water' | 'stop'; ace: boolean }

const snap = (w: World, events: Event[]): ShotFrame =>
  ({ t: w.time, x: w.ball.x, y: w.ball.y, vx: w.ball.vx, vy: w.ball.vy, spin: w.spinners.map((s) => s.angle), events });

/** Records the shots of the current hole. */
export class HoleRecorder {
  shots: Shot[] = [];
  private cur: Shot | null = null;

  reset() { this.shots = []; this.cur = null; }

  /** Call right after the ball is struck. */
  start(w: World, dir: [number, number], power: number) {
    this.cur = { frames: [snap(w, [])], dir, power, end: 'stop', ace: false };
  }

  /** Call after each physics step with its events; closes the shot when the ball comes to rest. */
  frame(w: World, events: Event[], strokes: number) {
    const s = this.cur;
    if (!s) return;
    s.frames.push(snap(w, events.filter((e) => e.type !== 'stop')));
    if (w.moving) return;
    s.end = events.some((e) => e.type === 'sink') ? 'sink' : events.some((e) => e.type === 'water') ? 'water' : 'stop';
    s.ace = s.end === 'sink' && strokes === 1;
    this.shots.push(s);
    this.cur = null;
  }
}

/** Interpolated state at time `t` into a shot (seconds of world time since it was struck). */
export function sampleShot(s: Shot, t: number) {
  const f = s.frames, t0 = f[0].t, at = t0 + t;
  let i = 0;
  while (i < f.length - 2 && f[i + 1].t <= at) i++;
  const a = f[i], b = f[Math.min(i + 1, f.length - 1)];
  const k = b.t > a.t ? Math.max(0, Math.min(1, (at - a.t) / (b.t - a.t))) : 1;
  const lerp = (p: number, q: number) => p + (q - p) * k;
  return {
    i, t: lerp(a.t, b.t), x: lerp(a.x, b.x), y: lerp(a.y, b.y), vx: lerp(a.vx, b.vx), vy: lerp(a.vy, b.vy),
    spin: a.spin.map((v, j) => lerp(v, b.spin[j])), done: at >= f[f.length - 1].t,
  };
}

/** Length of a shot in world seconds. */
export const shotLength = (s: Shot) => s.frames[s.frames.length - 1].t - s.frames[0].t;
