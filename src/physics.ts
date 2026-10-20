import { LevelDef, WORLD_H, WORLD_W, Zone } from './levels';

export const BALL_R = 12;
export const CUP_R = 21;
export const WALL_R = 13; // half thickness of wooden walls/bars
export const SPINNER_R = 8;
export const MAX_SHOT_SPEED = 1450;

const ROLL_DECEL = 120; // constant rolling resistance (units/s^2)
const LIN_DAMP = 0.55; // proportional damping (1/s)
const SAND_FACTOR = 5;
const REST_SPEED = 6;
const SINK_SPEED = 560; // faster than this and the ball lips out / skims over
const RAIL_E = 0.78;
const WALL_E = 0.7;
const BUMPER_E = 0.95;
// Fraction of the sliding (tangential) speed a surface grabs on contact.
const RAIL_GRIP = 0.04;
const WALL_GRIP = 0.07;
const BUMPER_GRIP = 0.02;

export interface Seg { ax: number; ay: number; bx: number; by: number; r: number }

export interface SpinnerState { x: number; y: number; len: number; speed: number; angle: number }

export interface AimPath { pts: { x: number; y: number }[]; contacts: number; cup: boolean }

export interface Ball { x: number; y: number; vx: number; vy: number }

export type Event =
  | { type: 'rail'; speed: number }
  | { type: 'wall'; speed: number }
  | { type: 'bumper'; speed: number }
  | { type: 'spinner'; speed: number }
  | { type: 'sink' }
  | { type: 'water' }
  | { type: 'lip' }
  | { type: 'stop' };

export class World {
  segs: Seg[] = [];
  spinners: SpinnerState[];
  ball: Ball;
  moving = false;
  /** Cushion / wall / bumper contacts since the last shot (for "bank shot" calls). */
  contacts = 0;
  private inCup = false;

  constructor(public level: LevelDef) {
    for (const line of level.walls ?? []) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i];
        const [bx, by] = line[i + 1];
        this.segs.push({ ax, ay, bx, by, r: WALL_R });
      }
    }
    for (const b of level.bars ?? []) {
      const a = (b.angle * Math.PI) / 180;
      const dx = (Math.cos(a) * b.len) / 2;
      const dy = (Math.sin(a) * b.len) / 2;
      this.segs.push({ ax: b.x - dx, ay: b.y - dy, bx: b.x + dx, by: b.y + dy, r: WALL_R });
    }
    this.spinners = (level.spinners ?? []).map((s) => ({ ...s, angle: 0 }));
    this.ball = { x: level.tee[0], y: level.tee[1], vx: 0, vy: 0 };
  }

  spinnerSegs(s: SpinnerState): Seg[] {
    const out: Seg[] = [];
    for (const off of [0, Math.PI / 2]) {
      const dx = Math.cos(s.angle + off) * s.len;
      const dy = Math.sin(s.angle + off) * s.len;
      out.push({ ax: s.x - dx, ay: s.y - dy, bx: s.x + dx, by: s.y + dy, r: SPINNER_R });
    }
    return out;
  }

  shoot(vx: number, vy: number) {
    this.ball.vx = vx;
    this.ball.vy = vy;
    this.moving = true;
    this.contacts = 0;
    this.inCup = false;
  }

  /** Advance the simulation; returns events that happened this frame. */
  step(dt: number): Event[] {
    const events: Event[] = [];
    const b = this.ball;
    const speed = Math.hypot(b.vx, b.vy);
    const sub = Math.max(1, Math.ceil((speed * dt) / (BALL_R * 0.4)), 2);
    const h = dt / sub;

    for (let i = 0; i < sub; i++) {
      for (const s of this.spinners) s.angle += s.speed * h;
      if (!this.moving) {
        // Resting ball can still be shoved by a spinner arm.
        this.collideSpinners(events, h);
        continue;
      }

      b.x += b.vx * h;
      b.y += b.vy * h;

      // Friction
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) {
        const sandy = (this.level.sand ?? []).some((z) => inZone(z, b.x, b.y));
        const decel = (ROLL_DECEL + LIN_DAMP * sp) * (sandy ? SAND_FACTOR : 1) * h;
        const ns = Math.max(0, sp - decel);
        b.vx *= ns / sp;
        b.vy *= ns / sp;
      }

      // Cup: gentle pull toward the centre; capture if slow enough.
      const [cx, cy] = this.level.cup;
      const dcx = cx - b.x;
      const dcy = cy - b.y;
      const dc = Math.hypot(dcx, dcy);
      if (dc >= CUP_R && this.inCup) {
        // Rolled across the cup without dropping
        this.inCup = false;
        events.push({ type: 'lip' });
      }
      if (dc < CUP_R) {
        this.inCup = true;
        const s2 = Math.hypot(b.vx, b.vy);
        if (s2 < SINK_SPEED && dc < CUP_R - BALL_R * 0.35) {
          events.push({ type: 'sink' });
          this.moving = false;
          return events;
        }
        const pull = 1400 * h;
        b.vx += (dcx / (dc || 1)) * pull;
        b.vy += (dcy / (dc || 1)) * pull;
      }

      // Water
      if ((this.level.water ?? []).some((z) => inZone(z, b.x, b.y))) {
        events.push({ type: 'water' });
        this.moving = false;
        b.vx = b.vy = 0;
        return events;
      }

      this.collideRails(events);
      for (const s of this.segs) this.collideSeg(s, WALL_E, 0, 0, 0, events, 'wall');
      for (const bp of this.level.bumpers ?? []) this.collideCircle(bp.x, bp.y, bp.r, BUMPER_E, events);
      this.collideSpinners(events, h);

      if (Math.hypot(b.vx, b.vy) < REST_SPEED) {
        b.vx = b.vy = 0;
        this.moving = false;
        events.push({ type: 'stop' });
        break;
      }
    }
    return events;
  }

  private collideSpinners(events: Event[], _h: number) {
    for (const s of this.spinners) {
      for (const seg of this.spinnerSegs(s)) this.collideSeg(seg, 0.85, s.x, s.y, s.speed, events, 'spinner');
    }
  }

  private collideRails(events: Event[]) {
    const b = this.ball;
    let hit = 0;
    const side = (nx: number, ny: number) => { hit = Math.max(hit, this.bounce(nx, ny, 0, 0, RAIL_E, RAIL_GRIP)); };
    if (b.x < BALL_R) { b.x = BALL_R; side(1, 0); }
    if (b.x > WORLD_W - BALL_R) { b.x = WORLD_W - BALL_R; side(-1, 0); }
    if (b.y < BALL_R) { b.y = BALL_R; side(0, 1); }
    if (b.y > WORLD_H - BALL_R) { b.y = WORLD_H - BALL_R; side(0, -1); }
    if (hit > 30) { events.push({ type: 'rail', speed: hit }); this.contacts++; }
  }

  /**
   * Resolve a contact along normal n against a surface moving at (svx, svy).
   * Harder hits lose a little more energy, and the surface grabs some of the
   * sliding speed. Returns the impact speed (0 if the ball was moving away).
   */
  private bounce(nx: number, ny: number, svx: number, svy: number, e0: number, grip: number) {
    const b = this.ball;
    const rvx = b.vx - svx;
    const rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    const e = e0 * (1 - 0.18 * Math.min(1, -vn / 1400));
    const tx = rvx - vn * nx;
    const ty = rvy - vn * ny;
    b.vx = svx + tx * (1 - grip) - e * vn * nx;
    b.vy = svy + ty * (1 - grip) - e * vn * ny;
    return -vn;
  }

  /** Capsule collision. (cx, cy, omega) describe rotation for moving spinner arms. */
  private collideSeg(s: Seg, e: number, cx: number, cy: number, omega: number, events: Event[], kind: 'wall' | 'spinner') {
    const b = this.ball;
    const p = closestOnSeg(s, b.x, b.y);
    let nx = b.x - p.x;
    let ny = b.y - p.y;
    const d = Math.hypot(nx, ny);
    const minD = BALL_R + s.r;
    if (d >= minD) return;
    if (d < 1e-6) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
    b.x = p.x + nx * minD;
    b.y = p.y + ny * minD;
    // Surface velocity of a rotating arm at the contact point: omega x r
    const wvx = -omega * (p.y - cy);
    const wvy = omega * (p.x - cx);
    const hit = this.bounce(nx, ny, wvx, wvy, e, kind === 'wall' ? WALL_GRIP : 0.05);
    if (hit > 0) this.moving = true;
    if (hit > 30) { events.push({ type: kind, speed: hit }); this.contacts++; }
  }

  private collideCircle(x: number, y: number, r: number, e: number, events: Event[]) {
    const b = this.ball;
    let nx = b.x - x;
    let ny = b.y - y;
    const d = Math.hypot(nx, ny);
    const minD = BALL_R + r;
    if (d >= minD || d < 1e-6) return;
    nx /= d; ny /= d;
    b.x = x + nx * minD;
    b.y = y + ny * minD;
    const hit = this.bounce(nx, ny, 0, 0, e, BUMPER_GRIP);
    if (hit > 30) { events.push({ type: 'bumper', speed: hit }); this.contacts++; }
  }

  /**
   * Trace the aim guide: a straight ray that banks off rails, walls and bumpers
   * (using each surface's restitution, like the real bounce). Spinners are ignored
   * because they move. Returns the path points; every point after the first is a
   * contact, except the last, which is where the guide runs out.
   */
  aimPath(dx: number, dy: number, maxLen: number, maxBounces: number): AimPath {
    const step = 3;
    const b = this.ball;
    let x = b.x, y = b.y;
    const pts = [{ x, y }];
    let bounces = 0, travelled = 0;
    const [cx, cy] = this.level.cup;
    while (travelled < maxLen) {
      const nx = x + dx * step, ny = y + dy * step;
      const hit = this.staticNormal(nx, ny);
      if (hit) {
        pts.push({ x, y });
        if (bounces++ >= maxBounces) return { pts, contacts: bounces, cup: false };
        const dot = dx * hit.x + dy * hit.y;
        dx -= (1 + hit.e) * dot * hit.x;
        dy -= (1 + hit.e) * dot * hit.y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        continue;
      }
      x = nx; y = ny;
      travelled += step;
      if (Math.hypot(x - cx, y - cy) < CUP_R * 0.6) { pts.push({ x, y }); return { pts, contacts: bounces, cup: true }; }
    }
    pts.push({ x, y });
    return { pts, contacts: bounces, cup: false };
  }

  private staticNormal(x: number, y: number): { x: number; y: number; e: number } | null {
    if (x < BALL_R) return { x: 1, y: 0, e: RAIL_E };
    if (x > WORLD_W - BALL_R) return { x: -1, y: 0, e: RAIL_E };
    if (y < BALL_R) return { x: 0, y: 1, e: RAIL_E };
    if (y > WORLD_H - BALL_R) return { x: 0, y: -1, e: RAIL_E };
    for (const s of this.segs) {
      const p = closestOnSeg(s, x, y);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < BALL_R + s.r) return { x: (x - p.x) / (d || 1), y: (y - p.y) / (d || 1), e: WALL_E };
    }
    for (const bp of this.level.bumpers ?? []) {
      const d = Math.hypot(x - bp.x, y - bp.y);
      if (d < BALL_R + bp.r) return { x: (x - bp.x) / d, y: (y - bp.y) / d, e: BUMPER_E };
    }
    return null;
  }
}

export function closestOnSeg(s: Seg, x: number, y: number) {
  const vx = s.bx - s.ax;
  const vy = s.by - s.ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((x - s.ax) * vx + (y - s.ay) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: s.ax + vx * t, y: s.ay + vy * t };
}

export function inZone(z: Zone, x: number, y: number) {
  if (z.kind === 'circle') return Math.hypot(x - z.x, y - z.y) < z.r;
  return x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h;
}
