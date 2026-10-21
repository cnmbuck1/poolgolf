import { Alien, Astronaut, Bridge, Cannon, Chute, Lift, Tier, Crater, Dino, Door, Igloo, LevelDef, Meteor, Pt, Rocket, Tumbleweed, WORLD_H, WORLD_W, Zone } from './levels';

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
/** Palm trunks are springier than rock. */
const PALM_E = 0.65;
/**
 * Spin, set where the cue strikes the ball (each axis -1..1).
 *   side  right (+) or left (-) english: the ball swerves that way as it rolls, and kicks that way off walls
 *   vert  top (+) or back (-) spin: follow rolls further and pushes on through a hit; draw grips sooner and
 *         pulls the ball back after it hits something
 */
export interface Spin { side: number; vert: number }
/** Sideways pull (units/s²) from full side spin while the ball is rolling quickly. */
const SWERVE = 420;
/** How fast spin wears off while rolling (1/s). */
const SPIN_DECAY = 0.7;
export const palmR = (p: { r?: number }) => p.r ?? 13;
/** Bridge deck: height of the hump, length of the ramp at each end, and the handrail radius. */
export const BRIDGE_H = 6;
export const BRIDGE_RAMP = 55;
export const BRIDGE_RAIL_R = 4;
/** Volcano flanks: peak height of the slope the ball feels around the cone. */
export const VOLCANO_SLOPE = 16;
export const volcanoCore = (r: number) => r * 0.42;

/** Bunkers are dished: this deep in the middle, easing in over BUNKER_EASE from the rim. */
export const BUNKER_DEPTH = 3;
const BUNKER_EASE = 22;
// Fraction of the sliding (tangential) speed a surface grabs on contact.
const RAIL_GRIP = 0.04;
const WALL_GRIP = 0.07;
const BUMPER_GRIP = 0.02;

/** `ledge`: the edge of tier `tier`; an `open` ledge only stops a ball below it (one on top rolls off). */
export interface Seg { ax: number; ay: number; bx: number; by: number; r: number; kind?: 'wall' | 'rail' | 'bridge' | 'ledge'; tier?: number; open?: boolean; nx?: number; ny?: number }

export interface SpinnerState { x: number; y: number; len: number; speed: number; angle: number; style?: 'windmill' | 'turnstile'; arms?: 1 | 2 }

export interface AimPath { pts: { x: number; y: number }[]; contacts: number; cup: boolean }

/** The ball; `z` is its height while it flies off a trampoline or out of a cannon. */
export interface Ball { x: number; y: number; vx: number; vy: number; z?: number }

export type Event =
  | { type: 'rail'; speed: number }
  | { type: 'wall'; speed: number }
  | { type: 'bumper'; speed: number }
  | { type: 'spinner'; speed: number }
  | { type: 'sink' }
  | { type: 'water' }
  | { type: 'launch'; by: 'trampoline' | 'cannon' | 'seal' | 'ramp' | 'rocket' | 'geyser' }
  | { type: 'land' }
  | { type: 'oob' }
  | { type: 'teleport'; via?: 'igloo' }
  | { type: 'quicksand' }
  | { type: 'chute' }
  | { type: 'ladder' }
  | { type: 'drop' }
  | { type: 'lip' }
  | { type: 'stop' };

export class World {
  segs: Seg[] = [];
  spinners: SpinnerState[];
  ball: Ball;
  moving = false;
  /** Seconds since the hole started; drives tumbleweeds and dinosaurs (the renderer reads it too). */
  time = 0;
  /** Cushion / wall / bumper contacts since the last shot (for "bank shot" calls). */
  contacts = 0;
  /** Spin left on the ball from the last shot. */
  spin: Spin = { side: 0, vert: 0 };
  /** A flight off a trampoline or out of a cannon: from (x0, y0) to (x1, y1), then rolling on at (vx, vy). */
  /**
   * `h0`, `h1`: ground height at take-off and landing (the arc rises from one to the other, so a flight up
   * onto a higher level lands on it smoothly). `src`: the launcher that fired it, for the renderer.
   */
  air: { t: number; dur: number; x0: number; y0: number; x1: number; y1: number; peak: number; vx: number; vy: number; h0: number; h1: number; src?: Lift } | null = null;
  /** Falling off a ledge: still rolling across the level below (walls and all), dropping at `vz`. */
  drop: { vz: number } | null = null;
  /** Riding a chute or climbing a ladder: `s` units along its track, at `speed`. */
  ride: { track: Track; s: number; speed: number; ladder: boolean } | null = null;
  /** Seconds after landing before a trampoline or cannon can catch the ball again. */
  private launchCool = 0;
  /** Seconds after coming out of a portal before another can take the ball. */
  private portalCool = 0;
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
    // Tier edges: icing rims on top, cliff faces below
    (level.tiers ?? []).forEach((t, ti) => {
      const area = t.pts.reduce((a, [x1, y1], k) => { const [x2, y2] = t.pts[(k + 1) % t.pts.length]; return a + x1 * y2 - x2 * y1; }, 0);
      t.pts.forEach(([ax, ay], i) => {
        const [bx, by] = t.pts[(i + 1) % t.pts.length];
        const l = Math.hypot(bx - ax, by - ay) || 1, dx = (bx - ax) / l, dy = (by - ay) / l;
        const [nx, ny] = area > 0 ? [dy, -dx] : [-dy, dx]; // outward
        this.segs.push({ ax, ay, bx, by, r: LEDGE_R, kind: 'ledge', tier: ti, open: t.open?.includes(i), nx, ny });
      });
    });
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

  /** Seconds the ball has spent crawling along almost stopped (see the rest check in step). */
  private crawl = 0;

  shoot(vx: number, vy: number, spin: Spin = { side: 0, vert: 0 }) {
    this.crawl = 0;
    this.air = null;
    this.ride = null;
    this.drop = null;
    this.ball.z = 0;
    this.spin = { ...spin };
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
      this.time += h;
      if (!this.moving) {
        // Resting ball can still be shoved by a spinner arm, a tumbleweed or a dinosaur.
        this.collideSpinners(events, h);
        this.collideMovers(events);
        continue;
      }

      if (this.air) {
        // In flight: over everything, along an arc, then land and roll on
        const a = this.air;
        a.t += h;
        const u = Math.min(1, a.t / a.dur);
        b.x = a.x0 + (a.x1 - a.x0) * u;
        b.y = a.y0 + (a.y1 - a.y0) * u;
        // Height above the line from take-off to landing, kept just clear of anything taller below
        const ground = heightAt(this.level, b.x, b.y);
        b.z = Math.max(a.h0 + (a.h1 - a.h0) * u + 4 * a.peak * u * (1 - u), ground + (u < 1 ? 2 : 0)) - ground;
        if (u < 1) continue;
        b.z = 0;
        this.air = null;
        b.vx = a.vx; b.vy = a.vy;
        this.launchCool = 0.3;
        if (!inZone({ kind: 'poly', pts: fairwayOutline(this.level) }, b.x, b.y)) {
          events.push({ type: 'oob' });
          this.moving = false;
          b.vx = b.vy = 0;
          return events;
        }
        events.push({ type: 'land' });
        continue;
      }
      if (this.ride) {
        // On a chute or ladder: carried along its track, then off the end
        const r = this.ride, tr = r.track;
        r.s += r.speed * h;
        if (!r.ladder) r.speed = Math.min(CHUTE_MAX, r.speed + CHUTE_G * tr.fall * h);
        const p = trackAt(tr, r.s);
        b.x = p.x; b.y = p.y;
        b.z = p.z - heightAt(this.level, p.x, p.y);
        if (r.ladder) b.z += 1.6 * Math.abs(Math.sin((r.s / LADDER_RUNG) * Math.PI)); // a bump on each rung
        b.vx = p.dx * r.speed; b.vy = p.dy * r.speed;
        if (r.s < tr.len) continue;
        b.z = 0;
        this.ride = null;
        const out = r.ladder ? LADDER_EXIT : Math.max(CHUTE_EXIT, r.speed * 0.75);
        b.vx = p.dx * out; b.vy = p.dy * out;
        this.portalCool = 0.4;
        continue;
      }
      const dropping = !!this.drop;
      if (!dropping) {
        if (this.launchCool > 0) this.launchCool -= h;
        else if (this.launch(events)) continue;
        if (this.portalCool > 0) this.portalCool -= h;
        else if (this.teleport(events)) continue;
      }

      const tiered = !!this.level.tiers;
      const step = (x: number, y: number) => heightNow(this.level, x, y, this.time) - groundAt(this.level, x, y); // levels only, not slopes
      const hBefore = tiered ? step(b.x, b.y) + (b.z ?? 0) : 0;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (tiered) {
        // Rolled off a ledge (or the ground fell away under it): it drops to the level below, still rolling
        // the way it was going. A platform sinking gently under a resting ball just carries it down.
        const z = hBefore - step(b.x, b.y);
        if (z > 1.5 || (this.drop && z > 0)) {
          b.z = z;
          if (!this.drop) {
            this.drop = { vz: 0 };
            const sp = Math.hypot(b.vx, b.vy);
            if (sp < DROP_MIN_SPEED) { b.vx *= DROP_MIN_SPEED / (sp || 1); b.vy *= DROP_MIN_SPEED / (sp || 1); } // tips over the edge
            events.push({ type: 'drop' });
          }
        }
      }
      if (this.drop) {
        const d = this.drop;
        d.vz -= DROP_G * h;
        b.z = (b.z ?? 0) + d.vz * h;
        if (b.z <= 0) {
          b.z = 0;
          this.drop = null;
          b.vx *= 0.85; b.vy *= 0.85;
          events.push({ type: 'land' });
        }
      }
      const falling = !!this.drop;

      // Slopes pull the ball downhill
      const [gx, gy] = slopeAt(this.level, b.x, b.y);
      b.vx -= SLOPE_G * gx * h;
      b.vy -= SLOPE_G * gy * h;

      // Friction
      const sp = Math.hypot(b.vx, b.vy);
      const sandy = (this.level.sand ?? []).some((z) => inZone(z, b.x, b.y));
      const quick = (this.level.quicksand ?? []).find((z) => inZone(z, b.x, b.y));
      if (quick) {
        // Quicksand drags the ball toward its middle
        const [qx, qy] = zoneCentre(quick);
        const d = Math.hypot(qx - b.x, qy - b.y) || 1;
        b.vx += ((qx - b.x) / d) * QUICKSAND_PULL * h;
        b.vy += ((qy - b.y) / d) * QUICKSAND_PULL * h;
      }
      const sn = this.spin;
      if (sp > 40 && Math.abs(sn.side) > 0.01) {
        // Side spin swerves the ball: a sideways pull, strongest while it's rolling quickly
        const k = (sn.side * SWERVE * Math.min(1, sp / 400) * h) / sp;
        const vx0 = b.vx;
        b.vx += -b.vy * k;
        b.vy += vx0 * k;
      }
      const spinFade = Math.exp(-SPIN_DECAY * h);
      sn.side *= spinFade;
      sn.vert *= spinFade;
      if (sp > 0) {
        // Topspin keeps it rolling; backspin bites; quicksand grips hardest of all
        const vertGrip = sn.vert > 0 ? 1 - 0.3 * sn.vert : 1 - 0.2 * sn.vert;
        const icy = (this.level.ice ?? []).some((z) => inZone(z, b.x, b.y));
        const sinking = quick ? QUICKSAND_FACTOR : sandy ? SAND_FACTOR : icy ? ICE_FACTOR : 1;
        const decel = (ROLL_DECEL + LIN_DAMP * sp) * sinking * vertGrip * h;
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
      if (dc < CUP_R && !falling) {
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
      if (!falling && (this.level.water ?? []).some((z) => inZone(z, b.x, b.y)) && !(this.level.bridges ?? []).some((br) => onBridge(br, b.x, b.y))) {
        events.push({ type: 'water' });
        this.moving = false;
        b.vx = b.vy = 0;
        return events;
      }

      const bh = this.level.tiers ? heightNow(this.level, b.x, b.y, this.time) + (b.z ?? 0) : 0;
      for (const s of this.segs) {
        if (s.kind === 'ledge' && !this.ledgeSolid(s, b.x, b.y, bh)) continue;
        const rail = s.kind === 'rail';
        this.collideSeg(s, rail ? RAIL_E : WALL_E, 0, 0, 0, events, rail ? 'rail' : 'wall');
      }
      for (const bp of this.level.bumpers ?? []) this.collideCircle(bp.x, bp.y, bp.r, BUMPER_E, events);
      for (const rk of this.level.rocks ?? []) this.collideCircle(rk.x, rk.y, rk.r, ROCK_E, events, 'wall');
      for (const pm of this.level.palms ?? []) this.collideCircle(pm.x, pm.y, palmR(pm), PALM_E, events, 'wall');
      for (const el of this.level.elephants ?? []) this.collideCircle(el.x, el.y, el.r ?? ELEPHANT_R, ROCK_E, events, 'wall');
      for (const pl of this.level.pillars ?? []) this.collideCircle(pl.x, pl.y, pl.r, ROCK_E, events, 'wall');
      for (const ig of this.level.igloos ?? []) this.collideCircle((ig.a[0] + ig.b[0]) / 2, (ig.a[1] + ig.b[1]) / 2, iglooDome(ig), ROCK_E, events, 'wall');
      for (const d of this.level.doors ?? []) if (doorClosed(d, this.time)) this.collideSeg(doorSeg(d), WALL_E, 0, 0, 0, events, 'wall');
      for (const v of this.level.volcanoes ?? []) this.collideCircle(v.x, v.y, volcanoCore(v.r), ROCK_E, events, 'wall');
      this.collideMovers(events);
      this.collideSpinners(events, h);

      // Stop when slow, unless the slope is steep enough to beat the surface's friction and keep it
      // rolling (sand grips much harder, so a ball resting on a bunker's dished edge stays put).
      // As a safety net, a ball that has crawled along barely moving for a while also comes to rest.
      const slow = Math.hypot(b.vx, b.vy);
      this.crawl = slow < REST_SPEED * 3 ? this.crawl + h : 0;
      if (!falling && ((slow < REST_SPEED && SLOPE_G * Math.hypot(gx, gy) < ROLL_DECEL * (sandy ? SAND_FACTOR : 1) * 1.1) || this.crawl > 1.5 || (quick && slow < 25))) {
        b.vx = b.vy = 0;
        this.moving = false;
        this.crawl = 0;
        // Coming to rest in quicksand: swallowed
        events.push({ type: (this.level.quicksand ?? []).some((z) => inZone(z, b.x, b.y)) ? 'quicksand' : 'stop' });
        break;
      }
    }
    return events;
  }

  /** Trampolines and cannons: start a flight if the ball has rolled onto one. */
  private launch(events: Event[]) {
    const b = this.ball, L = this.level;
    const sp = Math.hypot(b.vx, b.vy);
    for (const tp of L.trampolines ?? []) {
      if (sp < 40 || Math.hypot(b.x - tp.x, b.y - tp.y) > (tp.r ?? TRAMPOLINE_R)) continue;
      // Bounces on along its line: faster in, further out
      const dx = b.vx / sp, dy = b.vy / sp, dist = Math.max(140, Math.min(360, sp * 0.45));
      this.fly(b.x, b.y, b.x + dx * dist, b.y + dy * dist, 0.45 + dist / 900, 40 + dist * 0.25, dx * sp * 0.7, dy * sp * 0.7);
      events.push({ type: 'launch', by: 'trampoline' });
      return true;
    }
    for (const sl of L.seals ?? []) {
      if (Math.hypot(b.x - sl.x, b.y - sl.y) > SEAL_CATCH) continue;
      // The seal flips it with its tail, over everything, toward where it's facing
      const a = (sl.angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const x0 = sl.x + dx * 26, y0 = sl.y + dy * 26;
      this.fly(x0, y0, x0 + dx * sl.dist, y0 + dy * sl.dist, 0.5 + sl.dist / 1000, 50 + sl.dist * 0.25, dx * 150, dy * 150);
      events.push({ type: 'launch', by: 'seal' });
      return true;
    }
    for (const rp of L.ramps ?? []) {
      const a = (rp.angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
      const along = (b.x - rp.x) * ux + (b.y - rp.y) * uy, across = -(b.x - rp.x) * uy + (b.y - rp.y) * ux;
      const len = rp.len ?? RAMP_LEN, w = rp.width ?? RAMP_W;
      // Only taking off from the lip, heading up the ramp
      if (sp < 120 || along < len / 2 - 18 || along > len / 2 + 4 || Math.abs(across) > w / 2) continue;
      if ((b.vx * ux + b.vy * uy) / sp < 0.5) continue;
      const dist = Math.max(160, Math.min(440, sp * 0.5));
      const x0 = rp.x + ux * (len / 2), y0 = rp.y + uy * (len / 2);
      this.fly(x0, y0, x0 + ux * dist, y0 + uy * dist, 0.45 + dist / 1000, 40 + dist * 0.3, ux * sp * 0.8, uy * sp * 0.8);
      events.push({ type: 'launch', by: 'ramp' });
      return true;
    }
    for (const lf of L.lifts ?? []) {
      if (Math.hypot(b.x - lf.x, b.y - lf.y) > LIFT_CATCH) continue;
      // Up and away, high over everything, then down gently onto the target
      const d = Math.hypot(lf.to[0] - lf.x, lf.to[1] - lf.y), dx = (lf.to[0] - lf.x) / (d || 1), dy = (lf.to[1] - lf.y) / (d || 1);
      this.fly(lf.x, lf.y, lf.to[0], lf.to[1], 1.1 + d / 900, lf.kind === 'rocket' ? 190 + d * 0.15 : 120 + d * 0.15, dx * 90, dy * 90, lf);
      events.push({ type: 'launch', by: lf.kind });
      return true;
    }
    for (const c of L.cannons ?? []) {
      if (Math.hypot(b.x - c.x, b.y - c.y) > CANNON_CATCH) continue;
      const a = cannonAngle(c, this.time), dx = Math.cos(a), dy = Math.sin(a);
      const mx = c.x + dx * 34, my = c.y + dy * 34; // out of the muzzle
      this.fly(mx, my, mx + dx * c.dist, my + dy * c.dist, 0.55 + c.dist / 1100, 60 + c.dist * 0.28, dx * 360, dy * 360);
      events.push({ type: 'launch', by: 'cannon' });
      return true;
    }
    return false;
  }

  /** Scarab portals and igloo tunnels: a ball rolling into one comes out of its partner. Chutes and ladders pick it up. */
  private teleport(events: Event[]) {
    const b = this.ball;
    for (const [list, ladder] of [[this.level.chutes, false], [this.level.ladders, true]] as const) {
      for (const c of list ?? []) {
        if (Math.hypot(b.x - c.path[0][0], b.y - c.path[0][1]) > CHUTE_CATCH) continue;
        const track = chuteTrack(this.level, c, ladder);
        this.ride = { track, s: 0, speed: ladder ? LADDER_SPEED : Math.max(CHUTE_START, Math.hypot(b.vx, b.vy) * 0.7), ladder };
        this.spin = { side: 0, vert: 0 };
        events.push({ type: ladder ? 'ladder' : 'chute' });
        return true;
      }
    }
    for (const ig of this.level.igloos ?? []) {
      if (Math.hypot(b.x - ig.a[0], b.y - ig.a[1]) > IGLOO_DOOR) continue;
      const a = Math.atan2(ig.b[1] - ig.a[1], ig.b[0] - ig.a[0]), sp = Math.max(140, Math.hypot(b.vx, b.vy) * 0.9);
      b.x = ig.b[0] + Math.cos(a) * (IGLOO_DOOR + 4);
      b.y = ig.b[1] + Math.sin(a) * (IGLOO_DOOR + 4);
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      this.portalCool = 0.4;
      events.push({ type: 'teleport', via: 'igloo' });
      return false;
    }
    for (const p of this.level.portals ?? []) {
      if (Math.hypot(b.x - p.a[0], b.y - p.a[1]) > PORTAL_R) continue;
      const sp = Math.max(160, Math.hypot(b.vx, b.vy) * 0.95);
      const a = p.exit != null ? (p.exit * Math.PI) / 180 : Math.atan2(b.vy, b.vx);
      b.x = p.b[0] + Math.cos(a) * (PORTAL_R + 2);
      b.y = p.b[1] + Math.sin(a) * (PORTAL_R + 2);
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      this.portalCool = 0.4;
      events.push({ type: 'teleport' });
      return false;
    }
    return false;
  }

  private fly(x0: number, y0: number, x1: number, y1: number, dur: number, peak: number, vx: number, vy: number, src?: Lift) {
    this.air = { t: 0, dur, x0, y0, x1, y1, peak, vx, vy, h0: heightAt(this.level, x0, y0), h1: heightAt(this.level, x1, y1), src };
    // The ball's velocity points along the flight (the camera and the spin animation follow it)
    this.ball.vx = (x1 - x0) / dur; this.ball.vy = (y1 - y0) / dur;
    this.spin = { side: 0, vert: 0 };
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
    const sn = this.spin;
    if (-vn > 30 && (Math.abs(sn.side) > 0.01 || Math.abs(sn.vert) > 0.01)) {
      // Spin takes effect on contact: follow/draw push along/against the incoming line, english
      // kicks sideways relative to it. Each hit uses up some of the spin.
      const sp = Math.hypot(rvx, rvy), dx = rvx / sp, dy = rvy / sp;
      b.vx += dx * sn.vert * sp * 0.55 - dy * sn.side * sp * 0.3;
      b.vy += dy * sn.vert * sp * 0.55 + dx * sn.side * sp * 0.3;
      sn.vert *= 0.25;
      sn.side *= 0.5;
    }
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

  /**
   * Whether a tier's edge stops a ball at (x, y) whose height is `bh`: only where there's a step (the edge of
   * a raised platform level with the ground is no edge at all), and an open edge only from below.
   */
  private ledgeSolid(s: Seg, x: number, y: number, bh: number) {
    const reach = BALL_R + s.r;
    if (x < Math.min(s.ax, s.bx) - reach || x > Math.max(s.ax, s.bx) + reach || y < Math.min(s.ay, s.by) - reach || y > Math.max(s.ay, s.by) + reach) return false;
    const p = closestOnSeg(s, x, y), o = LEDGE_R + 2;
    const hIn = heightNow(this.level, p.x - s.nx! * o, p.y - s.ny! * o, this.time), hOut = heightNow(this.level, p.x + s.nx! * o, p.y + s.ny! * o, this.time);
    if (Math.abs(hIn - hOut) < STEP_H) return false;
    return !(s.open && bh >= (hIn + hOut) / 2);
  }

  /** Tumbleweeds and dinosaurs: moving circles and swinging tails. */
  private collideMovers(events: Event[]) {
    const m = movers(this.level, this.time);
    for (const c of m.circles) this.collideCircle(c.x, c.y, c.r, c.e, events, c.kind, c.vx, c.vy);
    for (const a of m.arms) this.collideSeg(a.seg, 0.6, a.cx, a.cy, a.omega, events, 'wall');
  }

  private collideCircle(x: number, y: number, r: number, e: number, events: Event[], kind: 'bumper' | 'wall' | 'rail' = 'bumper', svx = 0, svy = 0) {
    const b = this.ball;
    let nx = b.x - x;
    let ny = b.y - y;
    const d = Math.hypot(nx, ny);
    const minD = BALL_R + r;
    if (d >= minD || d < 1e-6) return;
    nx /= d; ny /= d;
    b.x = x + nx * minD;
    b.y = y + ny * minD;
    const hit = this.bounce(nx, ny, svx, svy, e, kind === 'bumper' ? BUMPER_GRIP : WALL_GRIP);
    if (hit > 0 && (svx || svy)) this.moving = true; // a moving obstacle can shove a resting ball
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
      if (s.kind === 'ledge' && !this.ledgeSolid(s, x, y, heightNow(this.level, x, y, this.time))) continue;
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
    for (const ig of this.level.igloos ?? []) {
      const mx = (ig.a[0] + ig.b[0]) / 2, my = (ig.a[1] + ig.b[1]) / 2, d = Math.hypot(x - mx, y - my);
      if (d < BALL_R + iglooDome(ig)) return { x: (x - mx) / d, y: (y - my) / d, e: ROCK_E };
    }
    for (const pl of this.level.pillars ?? []) {
      const d = Math.hypot(x - pl.x, y - pl.y);
      if (d < BALL_R + pl.r) return { x: (x - pl.x) / d, y: (y - pl.y) / d, e: ROCK_E };
    }
    for (const el of this.level.elephants ?? []) {
      const d = Math.hypot(x - el.x, y - el.y);
      if (d < BALL_R + (el.r ?? ELEPHANT_R)) return { x: (x - el.x) / d, y: (y - el.y) / d, e: ROCK_E };
    }
    for (const pm of this.level.palms ?? []) {
      const d = Math.hypot(x - pm.x, y - pm.y);
      if (d < BALL_R + palmR(pm)) return { x: (x - pm.x) / d, y: (y - pm.y) / d, e: PALM_E };
    }
    for (const rk of [...(this.level.rocks ?? []), ...(this.level.volcanoes ?? []).map((v) => ({ x: v.x, y: v.y, r: volcanoCore(v.r) }))]) {
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
    segs.some((s) => { if (s.open || (s.tier != null && L.tiers![s.tier].move)) return false; if (x < Math.min(s.ax, s.bx) - 30 || x > Math.max(s.ax, s.bx) + 30 || y < Math.min(s.ay, s.by) - 30 || y > Math.max(s.ay, s.by) + 30) return false; const p = closestOnSeg(s, x, y); return Math.hypot(x - p.x, y - p.y) < BALL_R + s.r; })
    || (L.bumpers ?? []).some((b) => Math.hypot(x - b.x, y - b.y) < BALL_R + b.r)
    || (L.rocks ?? []).some((b) => Math.hypot(x - b.x, y - b.y) < BALL_R + b.r)
    || (L.palms ?? []).some((b) => Math.hypot(x - b.x, y - b.y) < BALL_R + palmR(b))
    || (L.elephants ?? []).some((b) => Math.hypot(x - b.x, y - b.y) < BALL_R + (b.r ?? ELEPHANT_R))
    || (L.pillars ?? []).some((b) => Math.hypot(x - b.x, y - b.y) < BALL_R + b.r)
    || (L.igloos ?? []).some((ig) => Math.hypot(x - (ig.a[0] + ig.b[0]) / 2, y - (ig.a[1] + ig.b[1]) / 2) < BALL_R + iglooDome(ig))
    || (L.quicksand ?? []).some((z) => inZone(z, x, y))
    || (L.volcanoes ?? []).some((v) => Math.hypot(x - v.x, y - v.y) < BALL_R + volcanoCore(v.r))
    || movers(L, 0).arms.some((a) => a.omega === 0 && (() => { const p = closestOnSeg(a.seg, x, y); return Math.hypot(x - p.x, y - p.y) < BALL_R + a.seg.r; })())
    || ((L.water ?? []).some((z) => inZone(z, x, y)) && !(L.bridges ?? []).some((br) => onBridge(br, x, y)));
  const d = new Float64Array(W * H).fill(Infinity);
  const cell = (x: number, y: number) => Math.floor((x + O) / G) + Math.floor((y + O) / G) * W;
  const start = cell(L.cup[0], L.cup[1]);
  // Distances grow outward from the cup, so each step asks whether the ball could roll from the new cell
  // into the current one: never up onto a higher tier (open ledges are one-way, down), and chutes and
  // ladders carry it from their start to their end.
  const tierH = new Float64Array(W * H);
  // Moving platforms connect whatever they touch (wait for them to rise or sink)
  const moving = new Uint8Array(W * H);
  if (L.tiers?.length) for (let i = 0; i < W * H; i++) {
    const x = (i % W) * G + G / 2 - O, y = ((i / W) | 0) * G + G / 2 - O;
    tierH[i] = heightAt(L, x, y) - groundAt(L, x, y);
    moving[i] = L.tiers.some((t) => t.move && inPoly(t.pts, x, y)) ? 1 : 0;
  }
  const rides = new Map<number, { from: number; cost: number }[]>();
  for (const c of [...(L.chutes ?? []), ...(L.ladders ?? []), ...(L.lifts ?? []).map((lf) => ({ path: [[lf.x, lf.y], lf.to] as Pt[] }))]) {
    const a = c.path[0], b = c.path[c.path.length - 1], e = cell(b[0], b[1]);
    rides.set(e, [...(rides.get(e) ?? []), { from: cell(a[0], a[1]), cost: G }]);
  }
  const heap = new MinHeap();
  d[start] = 0; heap.push(start, 0);
  while (heap.size) {
    const [c, dc] = heap.pop();
    if (dc > d[c]) continue;
    const cx = c % W, cy = (c / W) | 0;
    const relax = (n: number, nd: number) => { if (nd < d[n]) { d[n] = nd; heap.push(n, nd); } };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = nx + ny * W;
      if (d[n] <= dc + G || (tierH[c] > tierH[n] + 0.5 && !moving[n] && !moving[c]) || blocked(nx * G + G / 2 - O, ny * G + G / 2 - O)) continue;
      relax(n, dc + G);
    }
    for (const r of rides.get(c) ?? []) relax(r.from, dc + r.cost);
  }
  const f = { d, W, H, G, O, blocked };
  fieldCache.set(L, f);
  return f;
}

/**
 * Walking distance from a point to the cup round walls, water and obstacles (on the routing grid; the
 * nearest open cell if the point itself sits against an obstacle). Infinity if there's no way through.
 */
export function routeDistance(world: World, x: number, y: number) {
  const f = routeField(world);
  const cx = Math.floor((x + f.O) / f.G), cy = Math.floor((y + f.O) / f.G);
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= f.W || ny >= f.H) continue;
    best = Math.min(best, f.d[nx + ny * f.W] + (dx || dy ? f.G : 0));
  }
  return best;
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Terrain height at a point (0 = flat), tiers included. Shared by physics and the renderer so what you see is what rolls. */
export function heightAt(level: LevelDef, x: number, y: number) {
  let h = groundAt(level, x, y);
  for (const t of level.tiers ?? []) if (!t.move && inPoly(t.pts, x, y)) h += t.h;
  return h;
}

/** Height right now, moving platforms included (at rest they're level with what's under them). */
export function heightNow(level: LevelDef, x: number, y: number, time: number) {
  let h = heightAt(level, x, y);
  for (const t of level.tiers ?? []) if (t.move && inPoly(t.pts, x, y)) h += tierLift(t, time);
  return h;
}

/** How far a moving platform has risen: down for 35% of its cycle, rising, up for 35%, sinking. */
export function tierLift(t: Tier, time: number) {
  if (!t.move) return t.h;
  const P = t.move.period ?? 6, u = (((time / P + (t.move.phase ?? 0)) % 1) + 1) % 1;
  const k = u < 0.35 ? 0 : u < 0.5 ? smooth((u - 0.35) / 0.15) : u < 0.85 ? 1 : 1 - smooth((u - 0.85) / 0.15);
  return t.h * k;
}

/** Terrain height without the tiers: the gentle slopes the ball feels (a tier top is level with its ground). */
export function groundAt(level: LevelDef, x: number, y: number) {
  let h = 0;
  for (const v of level.volcanoes ?? []) {
    // Flanks that rise toward the crater core (the core itself is solid)
    const d = Math.hypot(x - v.x, y - v.y);
    if (d < v.r * 1.6) h += VOLCANO_SLOPE * Math.exp(-((d / (v.r * 0.75)) ** 2));
  }
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
  for (const c of level.craters ?? []) {
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < c.r * 1.6) h += craterHeight(c, d);
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

/** Middle of a zone (a polygon's vertex average). */
export function zoneCentre(z: Zone): [number, number] {
  if (z.kind === 'circle') return [z.x, z.y];
  if (z.kind === 'rect') return [z.x + z.w / 2, z.y + z.h / 2];
  const n = z.pts.length;
  return [z.pts.reduce((a, p) => a + p[0], 0) / n, z.pts.reduce((a, p) => a + p[1], 0) / n];
}

export const TRAMPOLINE_R = 30;
/** How close to a seal the ball must roll for its tail to flip it. */
export const SEAL_CATCH = 24;
export const RAMP_LEN = 90, RAMP_W = 56;
/** Igloo doors: how close to a door's centre the ball must roll to go in. */
export const IGLOO_DOOR = 20;
/** Igloo dome radius: the doors sit just outside it. */
export const iglooDome = (ig: Igloo) => Math.hypot(ig.b[0] - ig.a[0], ig.b[1] - ig.a[1]) / 2 - 6;
/** Ice grips this much as hard as the felt. */
const ICE_FACTOR = 0.22;
/** How close to a scarab portal's centre the ball must roll to be taken. */
export const PORTAL_R = 20;
/** Quicksand grips this many times harder than the felt, and pulls toward its middle (units/s²). */
const QUICKSAND_FACTOR = 4;
const QUICKSAND_PULL = 140;
const DOOR_PERIOD = 4;
/** Is a stone door up (blocking) at time t? Each door is up for the first half of its cycle. */
export function doorClosed(d: Door, t: number) {
  return doorLift(d, t) > 0.5;
}
/** How far up a door is (0 = sunk into the floor, 1 = fully up), easing between the two. */
export function doorLift(d: Door, t: number) {
  const P = d.period ?? DOOR_PERIOD;
  const u = (((t / P + (d.phase ?? 0)) % 1) + 1) % 1;
  const ramp = 0.08; // fraction of the cycle spent moving
  if (u < 0.5 - ramp) return 1;
  if (u < 0.5) return (0.5 - u) / ramp;
  if (u < 1 - ramp) return 0;
  return (u - (1 - ramp)) / ramp;
}
export function doorSeg(d: Door): Seg {
  const a = (d.angle * Math.PI) / 180, dx = (Math.cos(a) * d.len) / 2, dy = (Math.sin(a) * d.len) / 2;
  return { ax: d.x - dx, ay: d.y - dy, bx: d.x + dx, by: d.y + dy, r: WALL_R };
}
/** How close to a cannon's mouth the ball must roll to be caught. */
export const CANNON_CATCH = 22;
export const ELEPHANT_R = 38;
/** A cannon's barrel angle (radians) at time t. */
export function cannonAngle(c: Cannon, t: number) {
  return ((c.angle + (c.sweep ?? 0) * Math.sin(t * (c.speed ?? 0.8))) * Math.PI) / 180;
}

/** Shot speed for a power setting 0..1 (squared at the low end, for finer control on short putts). */
export const shotSpeed = (p: number) => MAX_SHOT_SPEED * (p * p * 0.35 + p * 0.65);

const flatWorlds = new WeakMap<LevelDef, World>();
/**
 * Aim guide for a spun shot: plays the shot out on a flat, still copy of the hole (no slopes or sand,
 * no moving obstacles, volcano cores as plain boulders), so the dots show the swerve and how spin
 * changes the bounces. Returns the path, which bank each point comes after, and the contact points.
 */
export function spinPath(level: LevelDef, x: number, y: number, dx: number, dy: number, power: number, spin: Spin, maxBanks: number, maxLen: number) {
  let w = flatWorlds.get(level);
  if (!w) {
    const flat: LevelDef = {
      ...level, slopes: [], craters: [], sand: [], volcanoes: [], spinners: [], tumbleweeds: [], dinos: [],
      asteroids: [], aliens: [], astronauts: [], rockets: [], meteors: [],
      rocks: [...(level.rocks ?? []), ...(level.volcanoes ?? []).map((v) => ({ x: v.x, y: v.y, r: volcanoCore(v.r) }))],
    };
    w = new World(flat);
    flatWorlds.set(level, w);
  }
  w.ball.x = x; w.ball.y = y;
  const sp = shotSpeed(power);
  w.shoot(dx * sp, dy * sp, spin);
  const pts = [{ x, y }], seg = [0], hits: { x: number; y: number }[] = [];
  let len = 0, lx = x, ly = y;
  for (let k = 0; k < 240 && w.moving; k++) {
    const before = w.contacts;
    const ev = w.step(1 / 60);
    const b = w.ball;
    len += Math.hypot(b.x - lx, b.y - ly);
    lx = b.x; ly = b.y;
    if (w.contacts > before) {
      hits.push({ x: b.x, y: b.y });
      if (w.contacts > maxBanks) { pts.push({ x: b.x, y: b.y }); seg.push(before); break; }
    }
    pts.push({ x: b.x, y: b.y });
    seg.push(w.contacts);
    if (len > maxLen || ev.some((e) => e.type === 'water' || e.type === 'oob' || e.type === 'sink' || e.type === 'launch' || e.type === 'teleport' || e.type === 'quicksand')) break;
  }
  return { pts, seg, hits };
}

/** Crater profile at distance d from its centre: a smooth bowl and a rounded rim around it. */
export function craterHeight(c: Crater, d: number) {
  const depth = c.depth ?? 7, rim = c.rim ?? 4;
  const u = Math.min(1, d / c.r);
  return -depth * (1 - u * u) ** 2 + rim * Math.exp(-(((d - c.r) / (c.r * 0.2)) ** 2));
}

/** Terrain gradient (dh/dx, dh/dy). */
export function slopeAt(level: LevelDef, x: number, y: number): [number, number] {
  if (!level.slopes?.length && !level.bridges?.length && !level.sand?.length && !level.volcanoes?.length && !level.craters?.length) return [0, 0];
  const e = 0.5;
  return [
    (groundAt(level, x + e, y) - groundAt(level, x - e, y)) / (2 * e),
    (groundAt(level, x, y + e) - groundAt(level, x, y - e)) / (2 * e),
  ];
}

// ---------- moving obstacles ----------

export interface MoverCircle { x: number; y: number; r: number; vx: number; vy: number; e: number; kind: 'wall' | 'rail' }
export interface MoverArm { seg: Seg; cx: number; cy: number; omega: number }

/** Triangle wave 0..1..0 with eased turns, and its rate of change. */
function pingPong(t: number): [number, number] {
  const f = ((t % 2) + 2) % 2;
  const u = f < 1 ? f : 2 - f;
  const dir = f < 1 ? 1 : -1;
  // ease the ends so it slows before turning
  return [u * u * (3 - 2 * u), dir * 6 * u * (1 - u)];
}

/** Position and velocity of a tumbleweed at time t. */
export function tumbleweedAt(w: Tumbleweed, t: number) {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
  const [u, du] = pingPong((t * w.speed) / len + (w.phase ?? 0) * 2);
  const k = (du * w.speed) / len;
  return { x: w.a[0] + (w.b[0] - w.a[0]) * u, y: w.a[1] + (w.b[1] - w.a[1]) * u, vx: (w.b[0] - w.a[0]) * k, vy: (w.b[1] - w.a[1]) * k, r: w.r ?? 15 };
}

/** Pose of a dinosaur at time t: body position, heading, its velocity, and tail angle (radians). */
export function dinoPose(d: Dino, t: number) {
  const a = (d.angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  let x = d.x, y = d.y, vx = 0, vy = 0, tail = 0, tailRate = 0, heading = a;
  if (d.kind === 'bronto' && d.walk) {
    // Walks forward and back along its heading, turning round at each end
    const sp = d.speed ?? 0.3;
    const [u, du] = pingPong(t * sp);
    const off = (u - 0.5) * d.walk;
    x += ux * off; y += uy * off;
    vx = ux * du * sp * d.walk; vy = uy * du * sp * d.walk;
    if (du < 0) heading = a + Math.PI;
  }
  if (d.kind === 'trex') {
    const sp = d.speed ?? 1;
    const amp = ((d.swing ?? 30) * Math.PI) / 180;
    tail = amp * Math.sin(t * sp);
    tailRate = amp * sp * Math.cos(t * sp);
  }
  return { x, y, vx, vy, heading, tail, tailRate };
}

/** An alien's spot on its circle at time t, and its velocity. */
export function alienAt(a: Alien, t: number) {
  const th = t * a.speed + (a.phase ?? 0) * Math.PI * 2;
  return { x: a.x + Math.cos(th) * a.orbit, y: a.y + Math.sin(th) * a.orbit, vx: -Math.sin(th) * a.orbit * a.speed, vy: Math.cos(th) * a.orbit * a.speed, r: ALIEN_R };
}
export const ALIEN_R = 15;

/** An astronaut's position and velocity at time t (standing still when it has no b). */
export function astronautAt(s: Astronaut, t: number) {
  if (!s.b) return { x: s.a[0], y: s.a[1], vx: 0, vy: 0, r: ASTRONAUT_R };
  const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
  const sp = s.speed ?? 40;
  const [u, du] = pingPong((t * sp) / len + (s.phase ?? 0) * 2);
  const k = (du * sp) / len;
  return { x: s.a[0] + (s.b[0] - s.a[0]) * u, y: s.a[1] + (s.b[1] - s.a[1]) * u, vx: (s.b[0] - s.a[0]) * k, vy: (s.b[1] - s.a[1]) * k, r: ASTRONAUT_R };
}
export const ASTRONAUT_R = 17;
export const PENGUIN_R = 14;
export const GINGER_R = 14;

/**
 * A landing rocket's cycle at time t: `h` is its height (1 = out of sight, 0 = on the pad), `u` the
 * seconds into the cycle. It eases down, sits on the pad, then accelerates away.
 */
export function rocketAt(o: Rocket, t: number) {
  const P = o.period ?? 9;
  const u = (((t + (o.phase ?? 0) * P) % P) + P) % P;
  const D = 2.5, S = P - 3.5, L = S + 2; // touch down, start lifting off, gone
  const h = u < D ? (1 - u / D) ** 2 : u < S ? 0 : u < L ? ((u - S) / 2) ** 2 : 1;
  return { h, u, landed: h < 0.04, period: P };
}
export const ROCKET_R = 22;

/**
 * A falling asteroid's cycle at time t: a warning ring for 1.5 s, a 1 s fall, a few seconds sitting
 * on the ground, then it crumbles away. `h` is height (1 = high in the sky), `size` its scale.
 */
export function meteorAt(m: Meteor, t: number) {
  const P = m.period ?? 8;
  const u = (((t + (m.phase ?? 0) * P) % P) + P) % P;
  const warnAt = P - 2.5, fallAt = P - 1; // the cycle ends at impact
  const h = u >= fallAt ? 1 - (u - fallAt) : u >= warnAt ? 1 : 0;
  const sit = P - 3.2; // seconds on the ground, counted from impact at u = 0
  const size = u < sit ? 1 : u < sit + 0.5 ? 1 - (u - sit) / 0.5 : 0;
  return { h, u, size, grounded: u < sit + 0.2, warning: u >= warnAt, period: P, r: m.r ?? 22 };
}

/** Leg positions (forward, sideways, radius) per species; the renderer builds legs at exactly these spots. */
export const DINO_LEGS: Record<Dino['kind'], [number, number, number][]> = {
  bronto: [[40, 32, 9], [40, -32, 9], [-40, 32, 9], [-40, -32, 9]],
  trex: [[2, 28, 9], [2, -28, 9]],
  stego: [[38, 28, 8], [38, -28, 8], [-38, 28, 8], [-38, -28, 8]],
};

/** All moving colliders in a hole at time t (shared by physics and, for posing, the renderer). */
export function movers(level: LevelDef, t: number): { circles: MoverCircle[]; arms: MoverArm[] } {
  const circles: MoverCircle[] = [], arms: MoverArm[] = [];
  for (const w of level.tumbleweeds ?? []) {
    const p = tumbleweedAt(w, t);
    circles.push({ ...p, e: 0.45, kind: 'rail' });
  }
  for (const w of level.asteroids ?? []) circles.push({ ...tumbleweedAt(w, t), r: w.r ?? 20, e: 0.6, kind: 'wall' });
  for (const a of level.aliens ?? []) circles.push({ ...alienAt(a, t), e: 0.7, kind: 'rail' });
  for (const s of level.astronauts ?? []) circles.push({ ...astronautAt(s, t), e: 0.5, kind: 'wall' });
  for (const s of level.clowns ?? []) circles.push({ ...astronautAt(s, t), e: 0.6, kind: 'wall' });
  for (const s of level.mummies ?? []) circles.push({ ...astronautAt(s, t), e: 0.45, kind: 'wall' });
  for (const s of level.penguins ?? []) circles.push({ ...astronautAt(s, t), r: PENGUIN_R, e: 0.55, kind: 'wall' });
  for (const s of level.gingerbread ?? []) circles.push({ ...astronautAt(s, t), r: GINGER_R, e: 0.6, kind: 'wall' });
  for (const o of level.rockets ?? []) if (rocketAt(o, t).landed) circles.push({ x: o.x, y: o.y, r: ROCKET_R, vx: 0, vy: 0, e: 0.55, kind: 'wall' });
  for (const m of level.meteors ?? []) { const p = meteorAt(m, t); if (p.grounded) circles.push({ x: m.x, y: m.y, r: p.r, vx: 0, vy: 0, e: 0.5, kind: 'wall' }); }
  for (const d of level.dinos ?? []) {
    const p = dinoPose(d, t);
    const ux = Math.cos(p.heading), uy = Math.sin(p.heading);
    const at = (f: number, s: number) => [p.x + ux * f - uy * s, p.y + uy * f + ux * s] as const;
    // Legs only: every body is high enough for the ball to roll underneath, between the legs
    for (const [f, s, r] of DINO_LEGS[d.kind]) {
      const [x, y] = at(f, s);
      circles.push({ x, y, r, vx: p.vx, vy: p.vy, e: 0.6, kind: 'wall' });
    }
    if (d.kind === 'trex') {
      // The tail sweeps from the hips, low across the ground behind
      const [hx, hy] = at(-18, 0);
      const ta = p.heading + Math.PI + p.tail;
      // Near the hips the tail is high above the ball; it only reaches the ground from ~40 units back
      arms.push({ seg: { ax: hx + Math.cos(ta) * 40, ay: hy + Math.sin(ta) * 40, bx: hx + Math.cos(ta) * 120, by: hy + Math.sin(ta) * 120, r: 9 }, cx: hx, cy: hy, omega: p.tailRate });
    }
  }
  return { circles, arms };
}

// ---------- tiers, chutes and ladders ----------

/** Half-thickness of a tier's edge (the icing rim on top, the cliff face below). */
export const LEDGE_R = 5;
/** How fast a ball falls off a ledge (units/s²; a little floatier than the slopes, so drops read). */
const DROP_G = 1400;
/** A difference in height across a tier's edge smaller than this is no step at all (a platform level with its neighbour). */
const STEP_H = 6;
/** A ball creeping over an open edge tips off at least this fast, so it clears the face. */
const DROP_MIN_SPEED = 90;
export const CHUTE_CATCH = 24;
export const LIFT_CATCH = 22;
const CHUTE_START = 160, CHUTE_G = 900, CHUTE_MAX = 620, CHUTE_EXIT = 180;
export const LADDER_SPEED = 130, LADDER_EXIT = 150, LADDER_RUNG = 14;

function inPoly(pts: Pt[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const inTier = (level: LevelDef, i: number, x: number, y: number) => inPoly(level.tiers![i].pts, x, y);

/** The tier a point stands on, or -1 for the ground. Tiers listed later sit on top of earlier ones. */
export function tierAt(level: LevelDef, x: number, y: number) {
  const t = level.tiers ?? [];
  for (let i = t.length - 1; i >= 0; i--) if (inPoly(t[i].pts, x, y)) return i;
  return -1;
}

/** A chute or ladder's path as a smooth 3D track (sampled every few units), from the level it starts on to the one it ends on. */
export interface Track { pts: { x: number; y: number; z: number; s: number }[]; len: number; fall: number }
const trackCache = new WeakMap<Chute, Track>();
export function chuteTrack(level: LevelDef, c: Chute, ladder: boolean): Track {
  const hit = trackCache.get(c);
  if (hit) return hit;
  const P = (i: number) => c.path[Math.max(0, Math.min(c.path.length - 1, i))];
  const xy: Pt[] = [];
  for (let i = 0; i < c.path.length - 1; i++) {
    const n = ladder ? 1 : 10;
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      const f = (q: 0 | 1) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t3);
      xy.push([f(0), f(1)]);
    }
  }
  xy.push(c.path[c.path.length - 1]);
  const [sx, sy] = xy[0], [ex, ey] = xy[xy.length - 1];
  const z0 = heightAt(level, sx, sy), z1 = heightAt(level, ex, ey);
  let s = 0;
  const raw = xy.map(([x, y], i) => { if (i) s += Math.hypot(x - xy[i - 1][0], y - xy[i - 1][1]); return { x, y, s }; });
  const len = s || 1;
  // A chute runs level across the tier it starts on, then drops away steeply past the edge and levels
  // out toward the exit; a ladder climbs evenly up to the edge of the tier it ends on, then runs level.
  const t0 = tierAt(level, sx, sy), t1 = tierAt(level, ex, ey);
  const edge = ladder ? raw.find((p) => tierAt(level, p.x, p.y) === t1 && t1 >= 0)?.s ?? len : raw.find((p) => tierAt(level, p.x, p.y) !== t0)?.s ?? 0;
  const pts = raw.map((p) => {
    if (ladder) return { ...p, z: z0 + (z1 - z0) * Math.min(1, p.s / (edge || 1)) };
    const u = Math.max(0, (p.s - edge) / (len - edge || 1));
    return { ...p, z: z0 + (z1 - z0) * (1 - (1 - u) * (1 - u)) };
  });
  const tr = { pts, len, fall: Math.max(0, z0 - z1) / len };
  trackCache.set(c, tr);
  return tr;
}

/** Position, height and heading `s` units along a track. */
export function trackAt(tr: Track, s: number) {
  const P = tr.pts;
  let i = 1;
  while (i < P.length - 1 && P[i].s < s) i++;
  const a = P[i - 1], b = P[i];
  const u = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s || 1)));
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l };
}

/** A small binary min-heap of (cell, distance) for the route field. */
class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const { k, v } = this;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const { k, v } = this;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
