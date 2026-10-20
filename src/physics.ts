import { Bridge, LevelDef, Pt, WORLD_H, WORLD_W, Zone } from './levels';

export const BALL_R = 12;
export const CUP_R = 21;
export const WALL_R = 13; // half thickness of wooden walls/bars
export const SPINNER_R = 8;
export const MAX_SHOT_SPEED = 1450;
/** Half-width of the fairway edging; the outline is its centre line. */
export const EDGE_R = 10;
/** How hard slopes pull the ball (units/s² per unit of gradient), roughly 5/7·g for a rolling ball. */
const SLOPE_G = 3000;

const ROLL_DECEL = 120; // constant rolling resistance (units/s^2)
const LIN_DAMP = 0.55; // proportional damping (1/s)
const SAND_FACTOR = 5;
const REST_SPEED = 6;
const SINK_SPEED = 560; // faster than this and the ball lips out / skims over
const RAIL_E = 0.78;
const WALL_E = 0.7;
const BUMPER_E = 0.95;
const ROCK_E = 0.55;
/** Bridge deck: height of the hump, length of the ramp at each end, and the handrail radius. */
export const BRIDGE_H = 6;
export const BRIDGE_RAMP = 55;
export const BRIDGE_RAIL_R = 4;
/** Bunkers are dished: this deep in the middle, easing in over BUNKER_EASE from the rim. */
export const BUNKER_DEPTH = 3;
const BUNKER_EASE = 22;
// Fraction of the sliding (tangential) speed a surface grabs on contact.
const RAIL_GRIP = 0.04;
const WALL_GRIP = 0.07;
const BUMPER_GRIP = 0.02;

export interface Seg { ax: number; ay: number; bx: number; by: number; r: number; kind?: 'wall' | 'rail' | 'bridge' }

export interface SpinnerState { x: number; y: number; len: number; speed: number; angle: number; style?: 'windmill' | 'turnstile'; arms?: 1 | 2 }

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
    // Bridge handrails along both long sides of each deck
    for (const br of level.bridges ?? []) for (const side of [-1, 1]) {
      const [ax, ay, bx, by] = bridgeEdge(br, side);
      this.segs.push({ ax, ay, bx, by, r: BRIDGE_RAIL_R, kind: 'bridge' });
    }
    const outline = fairwayOutline(level);
    outline.forEach(([ax, ay], i) => {
      const [bx, by] = outline[(i + 1) % outline.length];
      this.segs.push({ ax, ay, bx, by, r: EDGE_R, kind: 'rail' });
    });
    this.spinners = (level.spinners ?? []).map((s) => ({ ...s, angle: 0 }));
    this.ball = { x: level.tee[0], y: level.tee[1], vx: 0, vy: 0 };
  }

  spinnerSegs(s: SpinnerState): Seg[] {
    const out: Seg[] = [];
    for (const off of s.arms === 1 ? [0] : [0, Math.PI / 2]) {
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

      // Slopes pull the ball downhill
      const [gx, gy] = slopeAt(this.level, b.x, b.y);
      b.vx -= SLOPE_G * gx * h;
      b.vy -= SLOPE_G * gy * h;

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

      // Water (unless the ball is on a bridge deck)
      if ((this.level.water ?? []).some((z) => inZone(z, b.x, b.y)) && !(this.level.bridges ?? []).some((br) => onBridge(br, b.x, b.y))) {
        events.push({ type: 'water' });
        this.moving = false;
        b.vx = b.vy = 0;
        return events;
      }

      for (const s of this.segs) {
        const rail = s.kind === 'rail';
        this.collideSeg(s, rail ? RAIL_E : WALL_E, 0, 0, 0, events, rail ? 'rail' : 'wall');
      }
      for (const bp of this.level.bumpers ?? []) this.collideCircle(bp.x, bp.y, bp.r, BUMPER_E, events);
      for (const rk of this.level.rocks ?? []) this.collideCircle(rk.x, rk.y, rk.r, ROCK_E, events, 'wall');
      this.collideSpinners(events, h);

      // Stop when slow, unless the slope is steep enough to keep it rolling
      if (Math.hypot(b.vx, b.vy) < REST_SPEED && SLOPE_G * Math.hypot(gx, gy) < ROLL_DECEL * 1.1) {
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
  private collideSeg(s: Seg, e: number, cx: number, cy: number, omega: number, events: Event[], kind: 'wall' | 'rail' | 'spinner') {
    const b = this.ball;
    // Cheap bounding-box reject before the exact test (outlines have many short segments)
    const reach = BALL_R + s.r;
    if (b.x < Math.min(s.ax, s.bx) - reach || b.x > Math.max(s.ax, s.bx) + reach || b.y < Math.min(s.ay, s.by) - reach || b.y > Math.max(s.ay, s.by) + reach) return;
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
    const hit = this.bounce(nx, ny, wvx, wvy, e, kind === 'wall' ? WALL_GRIP : kind === 'rail' ? RAIL_GRIP : 0.05);
    if (hit > 0) this.moving = true;
    if (hit > 30) { events.push({ type: kind, speed: hit }); this.contacts++; }
  }

  private collideCircle(x: number, y: number, r: number, e: number, events: Event[], kind: 'bumper' | 'wall' = 'bumper') {
    const b = this.ball;
    let nx = b.x - x;
    let ny = b.y - y;
    const d = Math.hypot(nx, ny);
    const minD = BALL_R + r;
    if (d >= minD || d < 1e-6) return;
    nx /= d; ny /= d;
    b.x = x + nx * minD;
    b.y = y + ny * minD;
    const hit = this.bounce(nx, ny, 0, 0, e, kind === 'wall' ? WALL_GRIP : BUMPER_GRIP);
    if (hit > 30) { events.push({ type: kind, speed: hit }); this.contacts++; }
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
    for (const s of this.segs) {
      const reach = BALL_R + s.r;
      if (x < Math.min(s.ax, s.bx) - reach || x > Math.max(s.ax, s.bx) + reach || y < Math.min(s.ay, s.by) - reach || y > Math.max(s.ay, s.by) + reach) continue;
      const p = closestOnSeg(s, x, y);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < BALL_R + s.r) return { x: (x - p.x) / (d || 1), y: (y - p.y) / (d || 1), e: s.kind === 'rail' ? RAIL_E : WALL_E };
    }
    for (const bp of this.level.bumpers ?? []) {
      const d = Math.hypot(x - bp.x, y - bp.y);
      if (d < BALL_R + bp.r) return { x: (x - bp.x) / d, y: (y - bp.y) / d, e: BUMPER_E };
    }
    for (const rk of this.level.rocks ?? []) {
      const d = Math.hypot(x - rk.x, y - rk.y);
      if (d < BALL_R + rk.r) return { x: (x - rk.x) / d, y: (y - rk.y) / d, e: ROCK_E };
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
  if (z.kind === 'rect') return x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h;
  if (!nearZone(z, x, y)) return false;
  let inside = false;
  const p = z.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const zoneBoxes = new WeakMap<Zone, [number, number, number, number]>();
/** Quick reject: is the point inside the zone's bounding box? */
function nearZone(z: Zone, x: number, y: number) {
  let b = zoneBoxes.get(z);
  if (!b) {
    if (z.kind === 'circle') b = [z.x - z.r, z.y - z.r, z.x + z.r, z.y + z.r];
    else if (z.kind === 'rect') b = [z.x, z.y, z.x + z.w, z.y + z.h];
    else b = [Math.min(...z.pts.map((p) => p[0])), Math.min(...z.pts.map((p) => p[1])), Math.max(...z.pts.map((p) => p[0])), Math.max(...z.pts.map((p) => p[1]))];
    zoneBoxes.set(z, b);
  }
  return x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];
}

/** Distance from a point to a zone's edge: positive inside, negative outside. */
export function zoneDepth(z: Zone, x: number, y: number) {
  if (z.kind === 'circle') return z.r - Math.hypot(x - z.x, y - z.y);
  if (z.kind === 'rect') {
    const dx = Math.min(x - z.x, z.x + z.w - x), dy = Math.min(y - z.y, z.y + z.h - y);
    return Math.min(dx, dy);
  }
  let best = Infinity;
  const p = z.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, ay] = p[j], [bx, by] = p[i];
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
  }
  return inZone(z, x, y) ? best : -best;
}

/** Bridge-local coordinates: u along the deck from its centre, v across it. */
function bridgeLocal(br: Bridge, x: number, y: number) {
  const a = (br.angle * Math.PI) / 180;
  const dx = x - br.x, dy = y - br.y;
  return { u: dx * Math.cos(a) + dy * Math.sin(a), v: -dx * Math.sin(a) + dy * Math.cos(a) };
}

export function onBridge(br: Bridge, x: number, y: number) {
  const { u, v } = bridgeLocal(br, x, y);
  return Math.abs(u) <= br.len / 2 && Math.abs(v) <= br.width / 2;
}

/** One long edge of a deck (side = -1 or 1), as [ax, ay, bx, by]; the handrail runs along it. */
export function bridgeEdge(br: Bridge, side: number): [number, number, number, number] {
  const a = (br.angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
  const o = side * (br.width / 2 + BRIDGE_RAIL_R);
  const cx = br.x + vx * o, cy = br.y + vy * o;
  return [cx - (ux * br.len) / 2, cy - (uy * br.len) / 2, cx + (ux * br.len) / 2, cy + (uy * br.len) / 2];
}

/** The hole's edging as a smooth closed curve: every corner of the outline is rounded off. */
export function fairwayOutline(level: LevelDef): Pt[] {
  const cached = outlineCache.get(level);
  if (cached) return cached;
  const m = EDGE_R; // the default edging sits just outside the old rectangle, so play is unchanged
  const raw: Pt[] = level.outline ?? [[-m, -m], [WORLD_W + m, -m], [WORLD_W + m, WORLD_H + m], [-m, WORLD_H + m]];
  const out = filletPolygon(raw, 70, 7);
  outlineCache.set(level, out);
  return out;
}
const outlineCache = new WeakMap<LevelDef, Pt[]>();

/** Replace each corner with a circular arc of up to `radius` (limited to 40% of the shorter neighbouring edge). */
export function filletPolygon(p: Pt[], radius: number, segs: number): Pt[] {
  const n = p.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = p[(i + n - 1) % n], [x, y] = p[i], [qx, qy] = p[(i + 1) % n];
    const l1 = Math.hypot(px - x, py - y), l2 = Math.hypot(qx - x, qy - y);
    const u1 = [(px - x) / l1, (py - y) / l1], u2 = [(qx - x) / l2, (qy - y) / l2];
    const cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
    const half = Math.acos(cos) / 2; // half the interior angle
    if (half > 1.5) { out.push([x, y]); continue; } // nearly straight
    const r = Math.min(radius, Math.tan(half) * 0.4 * Math.min(l1, l2));
    const t = r / Math.tan(half); // distance from the corner to each tangent point
    const a: Pt = [x + u1[0] * t, y + u1[1] * t], b: Pt = [x + u2[0] * t, y + u2[1] * t];
    // Quadratic Bézier through the corner approximates the arc closely enough here
    for (let k = 0; k <= segs; k++) {
      const s = k / segs, w0 = (1 - s) ** 2, w1 = 2 * s * (1 - s), w2 = s * s;
      out.push([w0 * a[0] + w1 * x + w2 * b[0], w0 * a[1] + w1 * y + w2 * b[1]]);
    }
  }
  return out;
}

/**
 * Where to look from (x, y) to head toward the cup: walks a distance field around walls, water,
 * rocks and bumpers and returns the furthest point along the route that is in a clear straight line.
 */
export function routeTarget(world: World, x: number, y: number): [number, number] {
  const L = world.level;
  const f = routeField(world);
  const G = f.G, O = f.O;
  const idx = (cx: number, cy: number) => cx + cy * f.W;
  let cx = Math.floor((x + O) / G), cy = Math.floor((y + O) / G);
  let best: [number, number] = L.cup;
  if (cx < 0 || cy < 0 || cx >= f.W || cy >= f.H || !isFinite(f.d[idx(cx, cy)])) return best;
  const clear = (tx: number, ty: number) => {
    const n = Math.ceil(Math.hypot(tx - x, ty - y) / 8);
    for (let k = 1; k <= n; k++) if (f.blocked(x + ((tx - x) * k) / n, y + ((ty - y) * k) / n)) return false;
    return true;
  };
  if (clear(L.cup[0], L.cup[1])) return L.cup;
  for (let step = 0; step < 200; step++) {
    let nx = cx, ny = cy, nd = f.d[idx(cx, cy)];
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const ax = cx + ox, ay = cy + oy;
      if (ax < 0 || ay < 0 || ax >= f.W || ay >= f.H) continue;
      if (f.d[idx(ax, ay)] < nd) { nd = f.d[idx(ax, ay)]; nx = ax; ny = ay; }
    }
    if (nx === cx && ny === cy) break;
    cx = nx; cy = ny;
    const px = cx * G + G / 2 - O, py = cy * G + G / 2 - O;
    if (clear(px, py)) best = [px, py]; else break;
  }
  return best;
}

const fieldCache = new WeakMap<LevelDef, { d: Float64Array; W: number; H: number; G: number; O: number; blocked: (x: number, y: number) => boolean }>();
function routeField(world: World) {
  const L = world.level;
  const hit = fieldCache.get(L);
  if (hit) return hit;
  const G = 10, O = 60, W = Math.ceil((WORLD_W + 2 * O) / G), H = Math.ceil((WORLD_H + 2 * O) / G);
  const segs = world.segs;
  const blocked = (x: number, y: number) =>
    segs.some((s) => { if (x < Math.min(s.ax, s.bx) - 30 || x > Math.max(s.ax, s.bx) + 30 || y < Math.min(s.ay, s.by) - 30 || y > Math.max(s.ay, s.by) + 30) return false; const p = closestOnSeg(s, x, y); return Math.hypot(x - p.x, y - p.y) < BALL_R + s.r; })
    || (L.bumpers ?? []).some((b) => Math.hypot(x - b.x, y - b.y) < BALL_R + b.r)
    || (L.rocks ?? []).some((b) => Math.hypot(x - b.x, y - b.y) < BALL_R + b.r)
    || ((L.water ?? []).some((z) => inZone(z, x, y)) && !(L.bridges ?? []).some((br) => onBridge(br, x, y)));
  const d = new Float64Array(W * H).fill(Infinity);
  const q: number[] = [];
  const start = Math.floor((L.cup[0] + O) / G) + Math.floor((L.cup[1] + O) / G) * W;
  d[start] = 0; q.push(start);
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = nx + ny * W;
      if (d[n] !== Infinity || blocked(nx * G + G / 2 - O, ny * G + G / 2 - O)) continue;
      d[n] = d[c] + G; q.push(n);
    }
  }
  const f = { d, W, H, G, O, blocked };
  fieldCache.set(L, f);
  return f;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Terrain height at a point (0 = flat). Shared by physics and the renderer so what you see is what rolls. */
export function heightAt(level: LevelDef, x: number, y: number) {
  let h = 0;
  for (const z of level.sand ?? []) {
    if (!nearZone(z, x, y)) continue;
    const d = zoneDepth(z, x, y);
    if (d > 0) h -= BUNKER_DEPTH * smooth(d / BUNKER_EASE);
  }
  for (const br of level.bridges ?? []) {
    const { u, v } = bridgeLocal(br, x, y);
    if (Math.abs(v) > br.width / 2 + BRIDGE_RAIL_R * 2 || Math.abs(u) > br.len / 2) continue;
    // A hump: ramps up from each end, flat across the middle
    h += BRIDGE_H * smooth((br.len / 2 - Math.abs(u)) / BRIDGE_RAMP);
  }
  for (const s of level.slopes ?? []) {
    if (s.kind === 'hill') {
      const sig = s.r / 2;
      h += s.h * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * sig * sig));
    } else {
      const a = (s.dir * Math.PI) / 180;
      const ux = Math.cos(a), uy = Math.sin(a);
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      // Span of the rect along the fall direction, so `drop` is the total fall across it
      const span = Math.abs(s.w * ux) + Math.abs(s.h * uy) || 1;
      const along = ((x - cx) * ux + (y - cy) * uy) / span; // -0.5 .. 0.5 inside
      const outX = Math.max(s.x - x, 0, x - (s.x + s.w));
      const outY = Math.max(s.y - y, 0, y - (s.y + s.h));
      const fade = 1 - smooth(Math.hypot(outX, outY) / s.feather);
      h += -s.drop * Math.max(-0.5, Math.min(0.5, along)) * fade;
    }
  }
  return h;
}

/** Terrain gradient (dh/dx, dh/dy). */
export function slopeAt(level: LevelDef, x: number, y: number): [number, number] {
  if (!level.slopes?.length && !level.bridges?.length && !level.sand?.length) return [0, 0];
  const e = 0.5;
  return [
    (heightAt(level, x + e, y) - heightAt(level, x - e, y)) / (2 * e),
    (heightAt(level, x, y + e) - heightAt(level, x, y - e)) / (2 * e),
  ];
}
