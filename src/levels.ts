// Course data. Coordinates are table-plane units (the ball has radius 12); holes without an
// outline use the original WORLD_W x WORLD_H rectangle.

export const WORLD_W = 1000;
export const WORLD_H = 500;

export type Pt = [number, number];

export type Zone =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'poly'; pts: Pt[] }; // organic outline; physics and visuals use the same points

export interface Bar { x: number; y: number; len: number; angle: number } // angle in degrees
export interface Bumper { x: number; y: number; r: number; color: string; n: number }
/** `windmill` is the full Hole 1 model (sized for len 82); `turnstile` is a smaller sweeper on a post. */
/** `arms`: 2 = a cross (four paddles, default), 1 = a single bar (two paddles). */
export interface Spinner { x: number; y: number; len: number; speed: number; style?: 'windmill' | 'turnstile'; arms?: 1 | 2 } // speed in rad/s
/** Plank footbridge: the ball can cross water on it. Centre, length along `angle` (degrees), deck width. */
export interface Bridge { x: number; y: number; len: number; width: number; angle: number }
/** A boulder: solid, and duller to bounce off than a wall. */
export interface Rock { x: number; y: number; r: number }
/** A tree on the fairway (a palm in the canyon, a moon tree in space): its trunk is a solid post of radius r (default 13). */
export interface Palm { x: number; y: number; r?: number; height?: number }
/** Rolls back and forth between a and b at `speed` units/s; `phase` (0..1) staggers start positions. */
export interface Tumbleweed { a: Pt; b: Pt; speed: number; r?: number; phase?: number }
/** A volcano cone: a solid crater core and slopes that roll the ball away. `r` is the base radius. */
export interface Volcano { x: number; y: number; r: number }
/**
 * Dinosaurs (angle in degrees is the way the head faces).
 *   bronto  walks back and forth `walk` units along its heading; the ball can roll under its belly
 *   trex    stands still and swings its tail ±`swing` degrees across the ground behind it
 *   stego   a solid, plated body
 */
export interface Dino { kind: 'bronto' | 'trex' | 'stego'; x: number; y: number; angle: number; walk?: number; swing?: number; speed?: number }
/** A space rock drifting back and forth between a and b (same motion as a tumbleweed), spinning as it goes. */
export interface Asteroid { a: Pt; b: Pt; speed: number; r?: number; phase?: number }
/** A little alien hopping round a circle of radius `orbit` about (x, y); `speed` in rad/s (negative turns the other way). */
export interface Alien { x: number; y: number; orbit: number; speed: number; phase?: number }
/** An astronaut: moonwalks between a and b, or stands waving at a when there is no b. */
export interface Astronaut { a: Pt; b?: Pt; speed?: number; phase?: number }
/**
 * A rocket that comes down onto a landing pad at (x, y), sits there for a few seconds (solid), then
 * lifts off again; `period` seconds per cycle, `phase` (0..1) staggers it.
 */
export interface Rocket { x: number; y: number; period?: number; phase?: number }
/** An asteroid that falls out of the sky onto (x, y) after a warning ring, sits there (solid), then crumbles. */
export interface Meteor { x: number; y: number; r?: number; period?: number; phase?: number }
/**
 * A trampoline: a ball rolling onto it is bounced high into the air along its line, further the faster
 * it was going, and flies over anything in the way. Landing outside the course is out of bounds.
 */
export interface Trampoline { x: number; y: number; r?: number }
/**
 * A circus cannon: a ball rolling into its mouth is fired `dist` units through the air the way the
 * barrel points. `sweep` (degrees either side) and `speed` (rad/s) swing the barrel back and forth.
 */
export interface Cannon { x: number; y: number; angle: number; dist: number; sweep?: number; speed?: number }
/**
 * A scarab portal: a ball rolling into `a` comes out of `b` at the same speed, heading `exit` degrees
 * (or the way it was going if no exit is given). One way only.
 */
export interface Portal { a: Pt; b: Pt; exit?: number }
/**
 * A stone door across the course (centre, length, angle in degrees like a bar). It slides down into the
 * floor and back up: open for the second half of every `period` seconds; `phase` (0..1) staggers doors.
 */
export interface Door { x: number; y: number; len: number; angle: number; period?: number; phase?: number }
/**
 * A seal on an ice floe: a ball rolling up to it is flipped by its tail through the air, `dist` units
 * the way `angle` (degrees) points, over anything in between.
 */
export interface Seal { x: number; y: number; angle: number; dist: number }
/**
 * A ski-jump ramp centred at (x, y), rising toward `angle` (degrees): a ball running up it (roughly that
 * way) takes off and flies, further the faster it arrives.
 */
export interface Ramp { x: number; y: number; angle: number; len?: number; width?: number }
/** An igloo tunnel: roll in at the `a` door and slide out of the `b` door; the dome between is solid. */
export interface Igloo { a: Pt; b: Pt }
/** An elephant standing on a drum (a polar bear on the Arctic course): a big solid obstacle. */
export interface Elephant { x: number; y: number; r?: number; angle?: number }
/** An impact crater: a bowl `depth` deep inside radius r, ringed by a raised rim `rim` high. */
export interface Crater { x: number; y: number; r: number; depth?: number; rim?: number }
/**
 * A raised layer (a slab of cake on the Candy course) standing `h` units above whatever is under it. Its
 * edges are icing rims the ball bounces off, except the `open` ones (edge i runs from pts[i] to pts[i+1]):
 * roll off those and the ball drops to the level below. From below, every edge is a solid wall.
 */
export interface Tier { pts: Pt[]; h: number; open?: number[]; move?: PlatformTimer }
/**
 * A moving platform: the tier rests flush with what's under it, rises `h` on a timer, holds, then sinks back
 * (every `period` seconds, default 6; `phase` 0..1 staggers it). Level with the ground, the ball rolls on and
 * off freely; raised, its sides are walls, and where it's level with a higher layer the ball rolls across.
 */
export interface PlatformTimer { period?: number; phase?: number }
/**
 * A chute (slide) or ladder along `path`: a ball rolling onto path[0] is carried along it to the last point,
 * sliding down a chute or climbing a ladder, and rolls off the end the way the path ends.
 */
export interface Chute { path: Pt[] }
/**
 * A launcher that carries the ball through the air to `to`, usually up onto another level: a ball rolling
 * onto it is caught (any speed) and lands gently at `to`, rolling on the way it flew. A launch rocket on the
 * moon, a geyser in the canyon.
 */
export interface Lift { x: number; y: number; to: Pt; kind: 'rocket' | 'geyser' }
export type Theme = 'garden' | 'jurassic' | 'space' | 'circus' | 'tomb' | 'arctic' | 'candy';

/**
 * Terrain shaping. Heights are in world units; the ball feels the slope (see physics.ts).
 *   hill  smooth bump (negative h makes a bowl), radius r is roughly where it fades out
 *   tilt  a plane that drops `drop` units across the rect in direction `dir` (degrees),
 *         fading smoothly to flat over `feather` units outside the rect
 */
export type Slope =
  | { kind: 'hill'; x: number; y: number; r: number; h: number }
  | { kind: 'tilt'; x: number; y: number; w: number; h: number; dir: number; drop: number; feather: number };

export interface LevelDef {
  name: string;
  par: number;
  tee: Pt;
  cup: Pt;
  walls?: Pt[][]; // polylines
  bars?: Bar[];
  bumpers?: Bumper[];
  spinners?: Spinner[];
  bridges?: Bridge[];
  rocks?: Rock[];
  palms?: Palm[];
  tumbleweeds?: Tumbleweed[];
  volcanoes?: Volcano[];
  dinos?: Dino[];
  asteroids?: Asteroid[];
  aliens?: Alien[];
  astronauts?: Astronaut[];
  craters?: Crater[];
  rockets?: Rocket[];
  meteors?: Meteor[];
  trampolines?: Trampoline[];
  cannons?: Cannon[];
  /** Clowns on unicycles, pedalling between two points (same motion as a moonwalking astronaut). */
  clowns?: Astronaut[];
  elephants?: Elephant[];
  portals?: Portal[];
  doors?: Door[];
  /** Quicksand: grips and drags the ball toward its middle; coming to rest in it costs a stroke. */
  quicksand?: Zone[];
  /** Mummies shuffling between two points (same motion as an astronaut). */
  mummies?: Astronaut[];
  /** Columns and obelisks: solid round posts. */
  pillars?: Rock[];
  /** Ice: the ball barely slows on it. */
  ice?: Zone[];
  seals?: Seal[];
  ramps?: Ramp[];
  igloos?: Igloo[];
  /** Penguins waddling between two points (same motion as an astronaut). */
  penguins?: Astronaut[];
  /** Raised layers. A tier may sit on top of one listed before it (their heights add up). */
  tiers?: Tier[];
  /** Slides that carry the ball down from one level to another. */
  chutes?: Chute[];
  /** Ladders that carry the ball up from one level to another. */
  ladders?: Chute[];
  lifts?: Lift[];
  /** Gingerbread men strolling between two points (same motion as an astronaut). */
  gingerbread?: Astronaut[];
  /** Set from the course; decides the look (water is lava in the jurassic course and a starry void in space). */
  theme?: Theme;
  water?: Zone[];
  sand?: Zone[];
  /** Fairway border: centre line of the edging, as a closed polygon. Defaults to the original rectangle. */
  outline?: Pt[];
  slopes?: Slope[];
  /** Visual treatment. 'premium' uses the detailed models from art.ts (Hole 1 is the benchmark). */
  art?: 'premium';
}

// ---------- organic shapes ----------

/** Smooth, irregular closed shape (pond, bunker) around (cx, cy), roughly rx by ry, turned `rot` degrees. */
export function blob(cx: number, cy: number, rx: number, ry: number, seed = 1, wobble = 0.16, rot = 0): Zone {
  const n = 40;
  const a0 = (rot * Math.PI) / 180;
  const ph = [seed * 1.7, seed * 2.3, seed * 3.1];
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = 1 + wobble * (0.55 * Math.sin(2 * t + ph[0]) + 0.3 * Math.sin(3 * t + ph[1]) + 0.15 * Math.sin(5 * t + ph[2]));
    const x = Math.cos(t) * rx * k, y = Math.sin(t) * ry * k;
    pts.push([cx + x * Math.cos(a0) - y * Math.sin(a0), cy + x * Math.sin(a0) + y * Math.cos(a0)]);
  }
  return { kind: 'poly', pts };
}

/** A winding creek along a centre line (Catmull-Rom smoothed), `width` wide with gently varying banks. */
export function creek(path: Pt[], width: number, seed = 1): Zone {
  const pts: Pt[] = [];
  const P = (i: number) => path[Math.max(0, Math.min(path.length - 1, i))];
  for (let i = 0; i < path.length - 1; i++) {
    for (let s = 0; s < 8; s++) {
      const t = s / 8, t2 = t * t, t3 = t2 * t;
      const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
      const f = (k: 0 | 1) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      pts.push([f(0), f(1)]);
    }
  }
  pts.push(path[path.length - 1]);
  const left: Pt[] = [], right: Pt[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = (width / 2) * (1 + 0.18 * Math.sin(i * 0.45 + seed));
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  });
  return { kind: 'poly', pts: [...left, ...right.reverse()] };
}

// Pool-ball colours for bumpers.
const BALL = {
  1: '#f2c230', 2: '#2d5fc4', 3: '#d8402f', 4: '#6a3fa0',
  5: '#ec7a2a', 6: '#2f8a4c', 7: '#8c2f2a', 8: '#1a1a1a',
} as const;
const ball = (n: keyof typeof BALL, x: number, y: number, r = 18): Bumper => ({ x, y, r, n, color: BALL[n] });

/** The original Garden Club course (retired from the course list; its look still serves the trick shots). */
export const GARDEN: LevelDef[] = [
  {
    // A dogleg garden fairway. The windmill guards the cup, so the straight line to the pin has to be
    // timed through its sweepers; the brick "leg" under it closes the low lane. The lane from the tee
    // falls away toward the bottom edge (aim a little high), a hill sits on the top bank route, and the
    // green is a shallow bowl around the cup.
    name: 'Break Shot',
    par: 3,
    art: 'premium',
    tee: [110, 390],
    cup: [895, 350],
    outline: [[80, 260], [420, 260], [480, 120], [560, 60], [900, 60], [960, 120], [960, 420], [900, 480], [40, 480], [40, 300]],
    bars: [{ x: 700, y: 439, len: 102, angle: 90 }],
    water: [{ kind: 'circle', x: 700, y: 265, r: 62 }],
    spinners: [{ x: 700, y: 265, len: 82, speed: 0.6, style: 'windmill' }],
    slopes: [
      { kind: 'tilt', x: 150, y: 270, w: 420, h: 200, dir: 90, drop: 4, feather: 50 },
      { kind: 'hill', x: 620, y: 112, r: 80, h: 6 },
      { kind: 'hill', x: 895, y: 350, r: 60, h: -2.5 },
    ],
  },
  {
    // A lily pond crosses the fairway: take the plank bridge, or risk the sandy strip along the
    // bottom edge. A boulder sits in front of the cup, and the green tips back toward the pond.
    name: 'Lily Pond',
    par: 3,
    tee: [120, 215],
    cup: [870, 300],
    outline: [[60, 100], [120, 40], [880, 40], [950, 110], [950, 380], [880, 460], [120, 460], [60, 400]],
    water: [blob(500, 205, 118, 190, 3, 0.14)],
    sand: [blob(500, 432, 62, 20, 5, 0.2)],
    bridges: [{ x: 500, y: 205, len: 300, width: 60, angle: 0 }],
    rocks: [{ x: 780, y: 252, r: 28 }, { x: 700, y: 110, r: 22 }, { x: 250, y: 360, r: 20 }],
    slopes: [{ kind: 'tilt', x: 690, y: 120, w: 230, h: 300, dir: 180, drop: 3, feather: 40 }],
  },
  {
    // An oval green strewn with boulders and three pool-ball bumpers, a gentle rise in the middle,
    // and a bunker short of the cup.
    name: 'Rock Garden',
    par: 3,
    tee: [110, 250],
    cup: [890, 250],
    outline: [[60, 180], [140, 80], [320, 40], [680, 40], [860, 80], [950, 180], [950, 320], [860, 420], [680, 460], [320, 460], [140, 420], [60, 320]],
    rocks: [
      { x: 330, y: 165, r: 26 }, { x: 350, y: 335, r: 30 }, { x: 600, y: 120, r: 24 },
      { x: 630, y: 385, r: 28 }, { x: 760, y: 190, r: 22 },
    ],
    bumpers: [ball(1, 470, 250, 18), ball(8, 560, 300, 18), ball(3, 700, 300, 18)],
    sand: [blob(800, 330, 70, 42, 2, 0.2, -15)],
    slopes: [{ kind: 'hill', x: 470, y: 250, r: 150, h: 5 }],
  },
  {
    // A winding creek splits the hole from top to bottom: cross on the upper or lower bridge.
    // The green tilts toward the creek, and a bunker guards the cup.
    name: 'The Creek',
    par: 3,
    tee: [110, 400],
    cup: [880, 110],
    outline: [[40, 300], [110, 230], [330, 230], [330, 40], [900, 40], [960, 100], [960, 330], [820, 480], [40, 480]],
    water: [creek([[468, 34], [445, 120], [520, 250], [490, 380], [518, 486]], 74, 2)], // ends tuck under the edging
    bridges: [
      { x: 450, y: 125, len: 170, width: 54, angle: 8 },
      { x: 498, y: 400, len: 170, width: 54, angle: -6 },
    ],
    sand: [blob(800, 190, 60, 38, 4, 0.22, 20)],
    rocks: [{ x: 620, y: 300, r: 30 }, { x: 360, y: 300, r: 20 }, { x: 650, y: 80, r: 18 }],
    slopes: [{ kind: 'tilt', x: 600, y: 60, w: 330, h: 380, dir: 180, drop: 3, feather: 40 }],
  },
  {
    // Three lanes linked by stone walls; turnstiles sweep across two of the gaps, and a bunker
    // waits before the cup. The bottom-right corner is cut at an angle to help the bank up.
    name: 'Turnstiles',
    par: 4,
    tee: [100, 420],
    cup: [900, 80],
    outline: [[30, 30], [970, 30], [970, 400], [900, 470], [30, 470]],
    walls: [
      [[30, 330], [700, 330]],
      [[300, 170], [970, 170]],
    ],
    spinners: [
      { x: 470, y: 400, len: 55, speed: -0.6, style: 'turnstile', arms: 1 },
      { x: 560, y: 250, len: 50, speed: 0.7, style: 'turnstile', arms: 1 },
    ],
    rocks: [{ x: 860, y: 420, r: 20 }, { x: 140, y: 250, r: 22 }],
    sand: [blob(700, 95, 70, 34, 6, 0.2)],
    slopes: [{ kind: 'hill', x: 300, y: 250, r: 110, h: 4 }],
  },
  {
    // The finale: brick walls funnel toward a racked set of pool balls that guards a raised green,
    // with boulders on the approach and bunkers either side of the rack.
    name: 'Eight Ball',
    par: 3,
    tee: [110, 250],
    cup: [905, 250],
    outline: [[50, 160], [150, 60], [600, 40], [960, 120], [960, 380], [600, 460], [150, 440], [50, 340]],
    bars: [
      { x: 330, y: 105, len: 190, angle: 30 },
      { x: 330, y: 395, len: 190, angle: -30 },
    ],
    walls: [[[960, 165], [850, 165]], [[960, 335], [850, 335]]],
    bumpers: [
      ball(1, 640, 250),
      ball(2, 672, 231), ball(3, 672, 269),
      ball(4, 704, 212), ball(8, 704, 250), ball(5, 704, 288),
      ball(6, 736, 193), ball(7, 736, 231), ball(1, 736, 269), ball(2, 736, 307),
    ],
    spinners: [{ x: 500, y: 250, len: 60, speed: 0.8, style: 'turnstile', arms: 1 }],
    rocks: [{ x: 240, y: 250, r: 22 }],
    sand: [blob(700, 105, 70, 32, 7, 0.2, 10), blob(700, 395, 70, 32, 8, 0.2, -10)],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 150, h: 5 }],
  },
];

const JURASSIC: LevelDef[] = [
  {
    // A lava river cuts across the dirt; cross on the basalt bridge or bank around the boulders.
    name: 'Lava Run',
    par: 3,
    tee: [110, 380],
    cup: [880, 140],
    outline: [[50, 300], [160, 230], [420, 220], [560, 60], [930, 60], [960, 260], [820, 470], [60, 470]],
    // The river crosses the fairway; the bridge lies along the tee-to-cup line
    water: [creek([[452, 482], [478, 380], [510, 255], [536, 150], [548, 82]], 70, 3)],
    bridges: [{ x: 508, y: 255, len: 190, width: 84, angle: -17 }],
    rocks: [{ x: 300, y: 425, r: 24 }, { x: 760, y: 330, r: 30 }, { x: 700, y: 95, r: 20 }],
    // A palm stands between the bridge and the cup, so the straight line off the bridge needs a bank
    palms: [{ x: 730, y: 190 }],
    slopes: [{ kind: 'hill', x: 880, y: 140, r: 60, h: -2.5 }],
  },
  {
    // Wide, cracked flats where tumbleweeds roll across your line. Time the gaps.
    name: 'Tumbleweed Flats',
    par: 3,
    tee: [100, 250],
    cup: [900, 250],
    outline: [[40, 160], [200, 50], [800, 50], [960, 160], [960, 340], [800, 450], [200, 450], [40, 340]],
    tumbleweeds: [
      { a: [330, 70], b: [330, 430], speed: 110, phase: 0 },
      { a: [520, 430], b: [520, 70], speed: 130, phase: 0.4 },
      { a: [710, 80], b: [710, 420], speed: 95, phase: 0.7 },
    ],
    rocks: [{ x: 430, y: 150, r: 22 }, { x: 610, y: 360, r: 26 }, { x: 610, y: 250, r: 24 }],
    palms: [{ x: 790, y: 185 }, { x: 420, y: 330, height: 140 }],
    sand: [blob(800, 340, 60, 30, 3, 0.2, -10)],
  },
  {
    // A brontosaurus wanders across the middle. Roll under its belly between the legs,
    // or go round either end past the lava pools.
    name: 'Bronto Crossing',
    par: 3,
    tee: [110, 250],
    cup: [890, 250],
    outline: [[40, 170], [160, 60], [840, 60], [960, 170], [960, 330], [840, 440], [160, 440], [40, 330]],
    dinos: [{ kind: 'bronto', x: 500, y: 250, angle: 90, walk: 120, speed: 0.35 }],
    water: [blob(500, 95, 80, 26, 4, 0.2), blob(500, 405, 80, 26, 6, 0.2)],
    rocks: [{ x: 300, y: 170, r: 20 }, { x: 700, y: 330, r: 22 }],
    palms: [{ x: 250, y: 320 }, { x: 770, y: 180, height: 140 }],
  },
  {
    // A dogleg up to a T-rex guarding the green: its tail sweeps across the approach.
    name: "Rex's Lair",
    par: 3,
    tee: [100, 400],
    cup: [880, 130],
    outline: [[40, 330], [120, 290], [540, 290], [600, 60], [960, 60], [960, 330], [900, 470], [40, 470]],
    dinos: [{ kind: 'trex', x: 830, y: 260, angle: 200, swing: 40, speed: 1.1 }],
    volcanoes: [{ x: 330, y: 438, r: 70 }],
    water: [blob(700, 410, 70, 30, 2, 0.2, 15)],
    rocks: [{ x: 640, y: 180, r: 22 }],
    palms: [{ x: 470, y: 395, height: 140 }, { x: 720, y: 110 }],
    slopes: [{ kind: 'hill', x: 880, y: 130, r: 60, h: -2.5 }],
  },
  {
    // The cup sits up on a red-rock mesa. Roll into the geyser between the volcanoes and it blasts the
    // ball up onto the mesa, or go round the second volcano to the timber ladder.
    name: 'Geyser Mesa',
    par: 3,
    tee: [100, 250],
    cup: [875, 300],
    outline: [[40, 160], [180, 40], [820, 40], [960, 160], [960, 340], [820, 460], [180, 460], [40, 340]],
    tiers: [{ pts: [[700, 40], [820, 40], [960, 160], [960, 340], [820, 460], [700, 460]], h: 40 }],
    lifts: [{ x: 620, y: 235, to: [800, 200], kind: 'geyser' }],
    ladders: [{ path: [[655, 400], [739, 400]] }],
    volcanoes: [{ x: 400, y: 190, r: 85 }, { x: 545, y: 330, r: 75 }],
    water: [creek([[250, 40], [330, 60], [440, 50], [520, 40]], 50, 5)],
    sand: [blob(830, 150, 45, 26, 7, 0.2, 20)],
    rocks: [{ x: 520, y: 110, r: 18 }],
    palms: [{ x: 250, y: 330 }, { x: 790, y: 390, height: 140 }],
    slopes: [{ kind: 'hill', x: 875, y: 300, r: 50, h: -2 }],
  },
  {
    // The finale: a stegosaurus blocks the middle, tumbleweeds patrol the lane past it, and
    // a lava river with one bridge guards the raised green.
    name: 'Extinction',
    par: 4,
    tee: [100, 250],
    cup: [905, 250],
    outline: [[40, 150], [160, 40], [840, 40], [960, 150], [960, 350], [840, 460], [160, 460], [40, 350]],
    dinos: [{ kind: 'stego', x: 360, y: 250, angle: 80 }],
    tumbleweeds: [
      { a: [520, 60], b: [520, 440], speed: 120, phase: 0.2 },
      { a: [470, 440], b: [470, 60], speed: 100, phase: 0.6 },
    ],
    water: [creek([[700, 40], [670, 160], [720, 300], [690, 460]], 64, 8)],
    bridges: [{ x: 700, y: 250, len: 140, width: 56, angle: 5 }],
    volcanoes: [{ x: 230, y: 440, r: 60 }],
    palms: [{ x: 230, y: 140, height: 140 }, { x: 830, y: 340 }],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 140, h: 5 }],
  },
];

const SPACE: LevelDef[] = [
  {
    // A gentle start on the moon: an astronaut waves from the middle of the fairway, and two
    // craters either side will curl a lazy putt.
    name: 'Moonwalk',
    par: 3,
    tee: [110, 250],
    cup: [880, 250],
    outline: [[40, 180], [170, 80], [820, 80], [960, 180], [960, 320], [820, 420], [170, 420], [40, 320]],
    astronauts: [{ a: [500, 250] }],
    craters: [{ x: 360, y: 150, r: 60 }, { x: 650, y: 350, r: 62 }, { x: 560, y: 150, r: 46 }, { x: 460, y: 365, r: 44 }],
    rocks: [{ x: 270, y: 345, r: 20 }, { x: 730, y: 140, r: 22 }],
    palms: [{ x: 760, y: 255 }, { x: 230, y: 175, height: 95 }],
    sand: [blob(800, 360, 50, 26, 2, 0.2, 10)],
    slopes: [{ kind: 'hill', x: 880, y: 250, r: 60, h: -2.5 }],
  },
  {
    // Asteroids drift up and down across the fairway. Time the gaps, or bank round them.
    name: 'Asteroid Belt',
    par: 3,
    tee: [100, 250],
    cup: [900, 250],
    outline: [[40, 160], [200, 50], [800, 50], [960, 160], [960, 340], [800, 450], [200, 450], [40, 340]],
    asteroids: [
      { a: [320, 85], b: [320, 415], speed: 95, r: 22, phase: 0 },
      { a: [510, 415], b: [510, 85], speed: 120, r: 24, phase: 0.35 },
      { a: [700, 90], b: [700, 410], speed: 85, r: 20, phase: 0.7 },
    ],
    rocks: [{ x: 420, y: 140, r: 20 }, { x: 600, y: 360, r: 22 }],
    palms: [{ x: 610, y: 250 }],
    craters: [{ x: 810, y: 150, r: 50 }, { x: 420, y: 330, r: 50 }, { x: 820, y: 350, r: 44 }],
  },
  {
    // A dogleg round a giant crater to a green up on a mesa. The only way up is the hover pad below it:
    // roll onto it while it's down, ride it up, and roll off onto the green. An alien hops round the crater.
    name: 'Crater Hop',
    par: 4,
    tee: [100, 400],
    cup: [870, 120],
    outline: [[40, 330], [130, 280], [500, 270], [580, 60], [960, 60], [960, 330], [880, 470], [40, 470]],
    tiers: [
      { pts: [[760, 60], [960, 60], [960, 190], [760, 190]], h: 36, open: [2, 3] },
      { pts: [[800, 190], [900, 190], [900, 265], [800, 265]], h: 36, move: { period: 6, phase: 0.2 } },
    ],
    craters: [{ x: 680, y: 345, r: 90, depth: 10, rim: 5 }],
    aliens: [{ x: 680, y: 345, orbit: 100, speed: 0.7 }],
    rocks: [{ x: 380, y: 420, r: 22 }, { x: 640, y: 120, r: 20 }],
    palms: [{ x: 480, y: 395 }, { x: 930, y: 160, height: 95 }],
    water: [blob(300, 330, 55, 22, 3, 0.25, 5)],
    slopes: [{ kind: 'hill', x: 870, y: 120, r: 50, h: -2 }],
  },
  {
    // A crack into space splits the fairway. Cross on the metal bridge, past a moonwalking
    // astronaut, then time your putt round the rocket landing in front of the cup.
    name: 'Space Walk',
    par: 3,
    tee: [110, 250],
    cup: [890, 250],
    outline: [[40, 170], [160, 60], [840, 60], [960, 170], [960, 330], [840, 440], [160, 440], [40, 330]],
    water: [creek([[470, 40], [440, 150], [500, 300], [460, 460]], 70, 4)],
    bridges: [{ x: 478, y: 250, len: 170, width: 80, angle: 5 }],
    astronauts: [{ a: [640, 110], b: [640, 390], speed: 45 }],
    rockets: [{ x: 790, y: 250, period: 9 }],
    craters: [{ x: 310, y: 255, r: 45 }, { x: 870, y: 375, r: 40 }],
    rocks: [{ x: 260, y: 160, r: 20 }, { x: 290, y: 360, r: 22 }],
    palms: [{ x: 690, y: 120 }],
  },
  {
    // Asteroids crash down either side of an alien circling mid-fairway; watch for the red warning
    // rings. Void pockets wait at the sides.
    name: 'Close Encounters',
    par: 3,
    tee: [100, 250],
    cup: [900, 250],
    outline: [[40, 160], [180, 40], [820, 40], [960, 160], [960, 340], [820, 460], [180, 460], [40, 340]],
    aliens: [{ x: 540, y: 250, orbit: 95, speed: -0.8, phase: 0.25 }],
    meteors: [{ x: 330, y: 250, r: 24, period: 8 }, { x: 760, y: 260, r: 22, period: 7, phase: 0.5 }],
    palms: [{ x: 250, y: 130, height: 95 }, { x: 680, y: 380 }],
    water: [blob(540, 85, 70, 24, 5, 0.25), blob(540, 415, 70, 24, 6, 0.25)],
    craters: [{ x: 200, y: 380, r: 50 }, { x: 440, y: 150, r: 45 }, { x: 600, y: 330, r: 40 }],
    rocks: [{ x: 430, y: 380, r: 18 }, { x: 650, y: 120, r: 18 }],
    sand: [blob(830, 130, 48, 26, 7, 0.2, 20)],
  },
  {
    // The finale: the green is up on a landing plateau. Roll into the launch rocket and it flies the ball
    // up there over the crack into space, or cross the bridge and climb the gantry. Asteroids, an astronaut
    // on patrol and a rocket landing by the cup.
    name: 'Lunar Landing',
    par: 4,
    tee: [100, 250],
    cup: [905, 250],
    outline: [[40, 150], [160, 40], [840, 40], [960, 150], [960, 350], [840, 460], [160, 460], [40, 350]],
    tiers: [{ pts: [[780, 40], [840, 40], [960, 150], [960, 350], [840, 460], [780, 460]], h: 40 }],
    lifts: [{ x: 560, y: 120, to: [860, 140], kind: 'rocket' }],
    ladders: [{ path: [[735, 330], [819, 330]] }],
    asteroids: [{ a: [290, 70], b: [290, 430], speed: 110, r: 22 }, { a: [390, 430], b: [390, 70], speed: 90, r: 18, phase: 0.5 }],
    astronauts: [{ a: [480, 200], b: [480, 400], speed: 50, phase: 0.3 }],
    water: [creek([[640, 40], [615, 160], [660, 300], [630, 460]], 64, 8)],
    bridges: [{ x: 644, y: 250, len: 140, width: 60, angle: 5 }],
    rockets: [{ x: 835, y: 250, period: 10, phase: 0.4 }],
    meteors: [{ x: 160, y: 360, r: 20, period: 9, phase: 0.2 }],
    craters: [{ x: 200, y: 140, r: 55 }, { x: 450, y: 300, r: 40 }, { x: 725, y: 410, r: 30 }],
    rocks: [{ x: 540, y: 420, r: 20 }],
    palms: [{ x: 720, y: 110 }],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 80, h: 3 }],
  },
];

const CIRCUS: LevelDef[] = [
  {
    // Under the big top: a wall splits the ring. Bounce over it off the trampoline, or squeeze round the ends.
    name: 'Center Ring',
    par: 3,
    tee: [110, 250],
    cup: [860, 330],
    outline: [[40, 170], [180, 70], [820, 70], [960, 170], [960, 330], [820, 430], [180, 430], [40, 330]],
    bars: [{ x: 520, y: 250, len: 250, angle: 90 }],
    trampolines: [{ x: 380, y: 250 }],
    bumpers: [{ x: 760, y: 250, r: 18, color: '#ff4a5a', n: 3 }, { x: 790, y: 150, r: 18, color: '#3a8aff', n: 2 }],
    slopes: [{ kind: 'hill', x: 860, y: 330, r: 60, h: -2.5 }],
  },
  {
    // Two clowns pedal across the lane, and an elephant holds the middle. Time it and pick a side.
    name: 'Clown Alley',
    par: 3,
    tee: [100, 250],
    cup: [900, 250],
    outline: [[40, 160], [160, 80], [840, 80], [960, 160], [960, 340], [840, 420], [160, 420], [40, 340]],
    clowns: [{ a: [330, 120], b: [330, 380], speed: 60 }, { a: [690, 380], b: [690, 120], speed: 75, phase: 0.4 }],
    elephants: [{ x: 510, y: 250, r: 40, angle: 180 }],
    sand: [blob(830, 360, 50, 24, 4, 0.2, -10)],
  },
  {
    // The human cannonball: roll into the cannon and it fires you up onto the stage where the cup is. It
    // swings, so time it: too early and you're out of the ring, too late and you land on the floor below
    // and have to climb the ladder.
    name: 'Human Cannonball',
    par: 4,
    tee: [100, 400],
    cup: [705, 115],
    outline: [[40, 330], [140, 290], [560, 290], [620, 60], [960, 60], [960, 330], [880, 470], [40, 470]],
    tiers: [{ pts: [[640, 60], [960, 60], [960, 240], [640, 240]], h: 36 }],
    cannons: [{ x: 430, y: 380, angle: -20, sweep: 25, speed: 0.9, dist: 470 }],
    ladders: [{ path: [[800, 290], [800, 206]] }],
    elephants: [{ x: 680, y: 390, r: 36, angle: 160 }],
    clowns: [{ a: [800, 90], b: [800, 180], speed: 40 }],
    slopes: [{ kind: 'hill', x: 705, y: 115, r: 55, h: -2.5 }],
  },
  {
    // A zig-zag of walls with trampolines to hop them, but bounce too hard near the edge and you're out.
    name: 'Bounce House',
    par: 4,
    tee: [120, 400],
    cup: [860, 120],
    outline: [[40, 300], [120, 60], [960, 60], [960, 200], [880, 460], [40, 460]],
    bars: [{ x: 360, y: 335, len: 270, angle: 90 }, { x: 640, y: 185, len: 250, angle: 90 }],
    trampolines: [{ x: 270, y: 300 }, { x: 520, y: 380 }, { x: 760, y: 340 }],
    bumpers: [{ x: 470, y: 150, r: 18, color: '#ffd23a', n: 1 }],
    sand: [blob(800, 210, 45, 26, 6, 0.2, 30)],
  },
  {
    // A carousel turns in the middle of the ring between two elephants. Find the gap.
    name: 'Carousel',
    par: 4,
    tee: [120, 250],
    cup: [880, 250],
    outline: [[40, 150], [160, 50], [840, 50], [960, 150], [960, 350], [840, 450], [160, 450], [40, 350]],
    spinners: [{ x: 500, y: 250, len: 85, speed: 0.9, style: 'turnstile' }],
    elephants: [{ x: 500, y: 95, r: 36, angle: 90 }, { x: 500, y: 405, r: 36, angle: 270 }],
    water: [blob(740, 250, 40, 60, 3, 0.2)],
    slopes: [{ kind: 'hill', x: 880, y: 250, r: 60, h: -2.5 }],
  },
  {
    // The finale: a swinging cannon to the raised green, trampolines on the flanks, a clown on patrol
    // and a dunk tank in the middle for anyone rolling the long way.
    name: 'Grand Finale',
    par: 3,
    tee: [100, 250],
    cup: [905, 250],
    outline: [[40, 150], [160, 50], [840, 50], [960, 150], [960, 350], [840, 450], [160, 450], [40, 350]],
    cannons: [{ x: 320, y: 250, angle: 0, sweep: 35, speed: 1.1, dist: 470 }],
    trampolines: [{ x: 560, y: 110 }, { x: 560, y: 390 }],
    clowns: [{ a: [700, 90], b: [700, 410], speed: 70 }],
    water: [blob(540, 250, 50, 70, 5, 0.2)],
    elephants: [{ x: 190, y: 120, r: 34, angle: 30 }],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 140, h: 5 }],
  },
];

const TOMB: LevelDef[] = [
  {
    // A wall seals the temple floor from side to side. The only way through is the scarab portal.
    name: 'Scarab Gate',
    par: 2,
    tee: [110, 250],
    cup: [880, 250],
    outline: [[40, 170], [180, 70], [820, 70], [960, 170], [960, 330], [820, 430], [180, 430], [40, 330]],
    bars: [{ x: 500, y: 250, len: 420, angle: 90 }],
    portals: [{ a: [360, 160], b: [640, 330], exit: -4 }],
    pillars: [{ x: 420, y: 360, r: 18 }, { x: 760, y: 140, r: 18 }],
    slopes: [{ kind: 'hill', x: 880, y: 250, r: 60, h: -2.5 }],
  },
  {
    // An S-bend between two temple walls, with quicksand narrowing each gap. Stop in it and it swallows the ball.
    name: 'Quicksand Flats',
    par: 5,
    tee: [100, 400],
    cup: [880, 110],
    outline: [[40, 60], [960, 60], [960, 460], [40, 460]],
    bars: [{ x: 380, y: 195, len: 290, angle: 90 }, { x: 650, y: 325, len: 290, angle: 90 }],
    quicksand: [blob(380, 405, 34, 38, 2, 0.2), blob(650, 115, 34, 38, 5, 0.2), blob(520, 260, 70, 50, 7, 0.25), blob(800, 330, 60, 45, 3, 0.25)],
    pillars: [{ x: 220, y: 160, r: 18 }, { x: 760, y: 170, r: 16 }],
    slopes: [{ kind: 'hill', x: 880, y: 110, r: 60, h: -2.5 }],
  },
  {
    // A corridor of stone doors that rise and sink on staggered timers, ending at a raised altar. The last
    // gate is a stone lift: stop on it while it's down, ride it up, and roll onto the altar.
    name: 'Hall of Doors',
    par: 4,
    tee: [100, 250],
    cup: [900, 250],
    outline: [[40, 160], [100, 110], [900, 110], [960, 160], [960, 340], [900, 390], [100, 390], [40, 340]],
    tiers: [
      { pts: [[800, 110], [900, 110], [960, 160], [960, 340], [900, 390], [800, 390]], h: 36, open: [5] },
      { pts: [[715, 195], [800, 195], [800, 305], [715, 305]], h: 36, move: { period: 6, phase: 0.5 } },
    ],
    doors: [
      { x: 320, y: 250, len: 300, angle: 90, period: 4, phase: 0 },
      { x: 540, y: 250, len: 300, angle: 90, period: 4, phase: 0.3 },
    ],
    pillars: [{ x: 430, y: 160, r: 14 }, { x: 650, y: 340, r: 14 }],
  },
  {
    // Two mummies shuffle back and forth between the columns.
    name: "Mummy's Curse",
    par: 3,
    tee: [110, 250],
    cup: [880, 250],
    outline: [[40, 150], [160, 50], [840, 50], [960, 150], [960, 350], [840, 450], [160, 450], [40, 350]],
    mummies: [{ a: [380, 90], b: [380, 410], speed: 45 }, { a: [620, 410], b: [620, 90], speed: 55, phase: 0.5 }],
    pillars: [{ x: 500, y: 150, r: 20 }, { x: 500, y: 350, r: 20 }],
    quicksand: [blob(790, 140, 50, 34, 3, 0.25)],
    slopes: [{ kind: 'hill', x: 880, y: 250, r: 60, h: -2.5 }],
  },
  {
    // The Nile cuts the valley. Cross on the narrow bridge, or take the scarab portal over the water,
    // and then get round the columns guarding the green.
    name: 'Oasis',
    par: 4,
    tee: [100, 400],
    cup: [880, 120],
    outline: [[40, 300], [120, 60], [960, 60], [960, 200], [880, 460], [40, 460]],
    water: [creek([[470, 40], [520, 180], [470, 320], [520, 480]], 104, 6)],
    bridges: [{ x: 494, y: 250, len: 190, width: 56, angle: 10 }],
    portals: [{ a: [260, 150], b: [640, 420], exit: -100 }],
    pillars: [{ x: 790, y: 170, r: 20 }, { x: 860, y: 230, r: 18 }, { x: 750, y: 90, r: 16 }, { x: 260, y: 300, r: 16 }],
    quicksand: [blob(720, 300, 60, 40, 8, 0.25)],
  },
  {
    // The pharaoh's chamber: the burial chamber stands on a raised dais. Time the great door, then climb the
    // stairs or roll into the scarab portal, which transports the ball up onto the far end of the dais. A second door
    // guards the cup, with quicksand either side and a mummy on patrol.
    name: "Pharaoh's Chamber",
    par: 3,
    tee: [100, 250],
    cup: [905, 250],
    outline: [[40, 150], [160, 50], [840, 50], [960, 150], [960, 350], [840, 450], [160, 450], [40, 350]],
    tiers: [{ pts: [[760, 50], [840, 50], [960, 150], [960, 350], [840, 450], [760, 450]], h: 36 }],
    ladders: [{ path: [[715, 250], [799, 250]] }],
    doors: [{ x: 640, y: 250, len: 400, angle: 90, period: 5, phase: 0.2 }, { x: 850, y: 250, len: 210, angle: 90, period: 3, phase: 0.5 }],
    portals: [{ a: [700, 110], b: [790, 410], exit: -80 }],
    mummies: [{ a: [470, 120], b: [470, 380], speed: 50 }],
    quicksand: [blob(880, 135, 40, 30, 4, 0.25), blob(880, 370, 40, 30, 6, 0.25)],
    pillars: [{ x: 250, y: 380, r: 18 }, { x: 560, y: 100, r: 16 }],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 80, h: 3 }],
  },
];

const ARCTIC: LevelDef[] = [
  {
    // Ice through the gate slides a long way, so mind the drifts. Or roll up to the seal and let it
    // flip you over everything to the green.
    name: 'Snowfall',
    par: 4,
    tee: [110, 250],
    cup: [880, 250],
    outline: [[40, 160], [170, 50], [830, 50], [960, 160], [960, 340], [830, 450], [170, 450], [40, 340]],
    ice: [blob(470, 250, 150, 80, 2, 0.2)],
    bars: [{ x: 650, y: 115, len: 150, angle: 90 }, { x: 650, y: 385, len: 150, angle: 90 }],
    sand: [blob(810, 120, 50, 28, 3, 0.2, 15), blob(810, 380, 50, 28, 4, 0.2, -15)],
    seals: [{ x: 300, y: 395, angle: -6, dist: 495 }],
    rocks: [{ x: 770, y: 250, r: 26 }, { x: 850, y: 175, r: 22 }],
    penguins: [{ a: [420, 90], b: [420, 410], speed: 40 }],
    slopes: [{ kind: 'hill', x: 880, y: 250, r: 60, h: -2.5 }],
  },
  {
    // Three penguins waddle across the lane; an igloo tunnel runs straight through the middle.
    name: 'Penguin Parade',
    par: 3,
    tee: [100, 250],
    cup: [890, 340],
    outline: [[40, 170], [140, 90], [860, 90], [960, 170], [960, 330], [860, 410], [140, 410], [40, 330]],
    penguins: [{ a: [320, 110], b: [320, 390], speed: 55 }, { a: [690, 390], b: [690, 110], speed: 65, phase: 0.4 }, { a: [800, 120], b: [800, 380], speed: 45, phase: 0.7 }],
    igloos: [{ a: [440, 250], b: [560, 250] }],
    ice: [blob(240, 250, 70, 50, 5, 0.2)],
  },
  {
    // A crevasse of icy water splits the field and the cup is up on a snowy ridge. Fly the ski jump over the
    // crevasse or cross the ice bridge, then ride the ski lift up.
    // Overshoot the cup and the toboggan run takes you all the way back down.
    name: 'Ski Jump',
    par: 4,
    tee: [100, 380],
    cup: [860, 160],
    outline: [[40, 120], [130, 50], [900, 50], [960, 120], [960, 380], [880, 460], [40, 460]],
    tiers: [{ pts: [[640, 50], [900, 50], [960, 120], [960, 270], [640, 270]], h: 40 }],
    ladders: [{ path: [[720, 320], [720, 230]] }],
    chutes: [{ path: [[932, 165], [990, 210], [995, 420], [800, 505], [400, 505], [200, 475], [160, 420]] }],
    water: [creek([[520, 30], [480, 160], [540, 300], [500, 480]], 90, 2)],
    bridges: [{ x: 512, y: 92, len: 150, width: 50, angle: -5 }],
    ramps: [{ x: 330, y: 340, angle: 4 }],
    elephants: [{ x: 850, y: 400, r: 36, angle: 200 }],
    sand: [blob(770, 110, 45, 26, 6, 0.2, 10)],
    slopes: [{ kind: 'hill', x: 860, y: 160, r: 60, h: -2.5 }],
  },
  {
    // Two polar bears guard the approach and an ice wall seals the green, all but a small gap at the
    // top. The seal on the right flips you clean over it.
    name: 'Polar Bear Pass',
    par: 4,
    tee: [100, 250],
    cup: [890, 250],
    outline: [[40, 150], [160, 50], [840, 50], [960, 150], [960, 350], [840, 450], [160, 450], [40, 350]],
    elephants: [{ x: 420, y: 160, r: 42, angle: 160 }, { x: 420, y: 340, r: 42, angle: 200 }],
    ice: [blob(280, 250, 90, 60, 7, 0.2)],
    bars: [{ x: 680, y: 290, len: 330, angle: 90 }],
    seals: [{ x: 580, y: 390, angle: -12, dist: 290 }],
    penguins: [{ a: [780, 100], b: [780, 400], speed: 50 }],
    slopes: [{ kind: 'hill', x: 890, y: 250, r: 60, h: -2.5 }],
  },
  {
    // A frozen lake: the ball slides and slides, and there are holes in the ice. A seal on a floe
    // mid-lake can flip you toward the green.
    name: 'Frozen Lake',
    par: 4,
    tee: [110, 400],
    cup: [880, 120],
    outline: [[40, 320], [120, 60], [960, 60], [960, 230], [880, 460], [40, 460]],
    ice: [blob(520, 270, 330, 170, 9, 0.15)],
    water: [blob(400, 200, 46, 34, 3, 0.25), blob(620, 360, 50, 36, 4, 0.25), blob(700, 200, 40, 30, 8, 0.25), blob(500, 262, 38, 30, 5, 0.25)],
    seals: [{ x: 560, y: 320, angle: -48, dist: 270 }],
    rocks: [{ x: 800, y: 150, r: 24 }],
    sand: [blob(880, 260, 50, 30, 2, 0.2), blob(790, 90, 40, 24, 6, 0.2)],
    slopes: [{ kind: 'hill', x: 880, y: 120, r: 60, h: -2.5 }],
  },
  {
    // The finale under the northern lights: an ice wall sealed by an igloo. Go through the tunnel or
    // fly the wall off the ski jump, then hold the slippery raised green.
    name: 'Northern Lights',
    par: 3,
    tee: [100, 250],
    cup: [905, 250],
    outline: [[40, 150], [160, 50], [840, 50], [960, 150], [960, 350], [840, 450], [160, 450], [40, 350]],
    bars: [{ x: 520, y: 125, len: 150, angle: 90 }, { x: 520, y: 375, len: 150, angle: 90 }],
    igloos: [{ a: [462, 250], b: [578, 210] }],
    ramps: [{ x: 330, y: 120, angle: -4 }],
    penguins: [{ a: [700, 90], b: [700, 410], speed: 55 }, { a: [820, 400], b: [820, 100], speed: 45, phase: 0.5 }],
    rocks: [{ x: 860, y: 175, r: 20 }, { x: 860, y: 325, r: 20 }],
    ice: [blob(780, 250, 70, 110, 6, 0.2)],
    sand: [blob(880, 110, 40, 26, 5, 0.2), blob(880, 390, 40, 26, 7, 0.2)],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 140, h: 5 }],
  },
];

export interface CourseDef { id: string; name: string; theme: Theme; holes: LevelDef[] }

/** A regular polygon around (cx, cy): vertex k at angle `rot` + k·360/n degrees (edge k runs from vertex k to k+1). */
const ngon = (cx: number, cy: number, r: number, n: number, rot = 0): Pt[] =>
  Array.from({ length: n }, (_, k) => { const a = ((rot + (k * 360) / n) * Math.PI) / 180; return [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)] as Pt; });
const gumdrop = (x: number, y: number, n: keyof typeof BALL = 3, r = 18) => ball(n, x, y, r);

const CANDY: LevelDef[] = [
  {
    // Tee off the top of a cake layer: roll off its open front edge onto the mint fairway below, then
    // round the chocolate pond and the gumdrops to the cup.
    name: 'Sugar Rush',
    par: 3,
    tee: [130, 250],
    cup: [870, 310],
    outline: [[40, 110], [100, 50], [900, 50], [960, 110], [960, 390], [900, 450], [100, 450], [40, 390]],
    tiers: [{ pts: [[40, 110], [100, 50], [290, 50], [290, 450], [100, 450], [40, 390]], h: 36, open: [2] }],
    water: [blob(590, 250, 70, 95, 2, 0.16)],
    bumpers: [gumdrop(770, 200, 3), gumdrop(790, 400, 6), gumdrop(450, 330, 1)],
    palms: [{ x: 440, y: 130 }, { x: 700, y: 120 }],
    slopes: [{ kind: 'hill', x: 870, y: 310, r: 60, h: -2.5 }],
  },
  {
    // The cup sits up on a cake layer: roll onto the foot of the candy-cane ladder (mind the gingerbread
    // man strolling past it) and it carries the ball up to the top.
    name: 'Candy Cane Ladder',
    par: 3,
    tee: [110, 330],
    cup: [850, 340],
    outline: [[40, 100], [100, 40], [900, 40], [960, 100], [960, 400], [900, 460], [100, 460], [40, 400]],
    tiers: [{ pts: [[640, 40], [900, 40], [960, 100], [960, 400], [900, 460], [640, 460]], h: 36 }],
    ladders: [{ path: [[600, 130], [684, 130]] }],
    gingerbread: [{ a: [530, 70], b: [530, 300], speed: 45 }],
    bumpers: [gumdrop(330, 200, 2), gumdrop(420, 380, 5)],
    sand: [blob(470, 150, 50, 30, 3, 0.2, 10)],
    palms: [{ x: 250, y: 120 }],
    slopes: [{ kind: 'hill', x: 850, y: 340, r: 60, h: -2.5 }],
  },
  {
    // A chocolate river runs down the middle. Drop off the tee layer and cross on the wafer bridge, or
    // find the mouth of the rainbow chute, which slides the ball over the river to the far bank.
    name: 'Chocolate Falls',
    par: 3,
    tee: [110, 330],
    cup: [860, 390],
    outline: [[40, 100], [100, 40], [900, 40], [960, 100], [960, 400], [900, 460], [100, 460], [40, 400]],
    tiers: [{ pts: [[40, 100], [100, 40], [300, 40], [300, 460], [100, 460], [40, 400]], h: 36, open: [2] }],
    chutes: [{ path: [[200, 120], [300, 75], [440, 70], [600, 80], [700, 110], [760, 150]] }],
    water: [creek([[525, 34], [505, 140], [545, 260], [515, 380], [530, 466]], 80, 4)],
    bridges: [{ x: 528, y: 330, len: 180, width: 60, angle: 0 }],
    bumpers: [gumdrop(720, 335, 4), gumdrop(780, 250, 1), gumdrop(900, 310, 5)],
    palms: [{ x: 400, y: 200 }],
    slopes: [{ kind: 'hill', x: 860, y: 390, r: 55, h: -2.5 }],
  },
  {
    // A cake stands in the middle of the lane. Stop on the platform in front of it while it's down and ride
    // it up level with the cake, then roll off the cake's open far side toward the cup; or go round it
    // through the lanes where the gingerbread men stroll.
    name: 'Gingerbread Lane',
    par: 3,
    tee: [100, 250],
    cup: [870, 250],
    outline: [[40, 100], [100, 40], [900, 40], [960, 100], [960, 400], [900, 460], [100, 460], [40, 400]],
    tiers: [
      { pts: [[380, 140], [620, 140], [620, 360], [380, 360]], h: 36, open: [1, 3] },
      { pts: [[290, 195], [380, 195], [380, 305], [290, 305]], h: 36, move: { period: 5 } },
    ],
    gingerbread: [{ a: [500, 52], b: [500, 98], speed: 30 }, { a: [520, 448], b: [520, 402], speed: 34, phase: 0.5 }],
    spinners: [{ x: 760, y: 250, len: 50, speed: 0.7, style: 'turnstile', arms: 1 }],
    bumpers: [gumdrop(200, 120, 2), gumdrop(200, 380, 5)],
    sand: [blob(880, 130, 50, 30, 6, 0.2)],
    slopes: [{ kind: 'hill', x: 870, y: 250, r: 60, h: -2.5 }],
  },
  {
    // The board game itself: climb two ladders up the cake steps to the top layer. Overshoot the cup and
    // the chute behind it slides the ball all the way back down to the start.
    name: 'Chutes & Ladders',
    par: 5,
    tee: [110, 250],
    cup: [850, 320],
    outline: [[40, 100], [100, 40], [900, 40], [960, 100], [960, 400], [900, 460], [100, 460], [40, 400]],
    tiers: [
      { pts: [[360, 40], [900, 40], [960, 100], [960, 400], [900, 460], [360, 460]], h: 36 },
      { pts: [[680, 40], [900, 40], [960, 100], [960, 400], [900, 460], [680, 460]], h: 36 },
    ],
    ladders: [{ path: [[320, 380], [404, 380]] }, { path: [[640, 120], [724, 120]] }],
    chutes: [{ path: [[900, 420], [990, 470], [960, 515], [600, 520], [300, 515], [180, 470], [170, 400]] }],
    bumpers: [gumdrop(520, 250, 3), gumdrop(220, 150, 6)],
    gingerbread: [{ a: [470, 70], b: [470, 200], speed: 40 }],
    palms: [{ x: 250, y: 370 }],
    slopes: [{ kind: 'hill', x: 850, y: 320, r: 55, h: -2 }],
  },
  {
    // The finale: a two-layer cake with the cup on top. Ladders climb each layer (the second faces the
    // first, round the corner of the top layer), and the open
    // east sides of both layers send an overhit ball tumbling back down to the ground.
    name: 'Cake Walk',
    par: 4,
    tee: [110, 250],
    cup: [705, 212],
    outline: [[40, 100], [100, 40], [900, 40], [960, 100], [960, 400], [900, 460], [100, 460], [40, 400]],
    tiers: [
      { pts: ngon(650, 250, 175, 8, 22.5), h: 36, open: [7, 0] },
      { pts: ngon(650, 250, 92, 8, 22.5), h: 36, open: [7, 0] },
    ],
    ladders: [{ path: [[438, 250], [522, 250]] }, { path: [[562, 162], [616, 216]] }],
    water: [blob(335, 125, 44, 26, 5, 0.2), blob(335, 375, 44, 26, 6, 0.2)],
    bumpers: [gumdrop(560, 120, 1), gumdrop(560, 380, 4), gumdrop(880, 250, 2)],
    gingerbread: [{ a: [180, 72], b: [420, 72], speed: 45 }],
    palms: [{ x: 200, y: 160 }, { x: 200, y: 410 }],
    slopes: [{ kind: 'hill', x: 705, y: 212, r: 50, h: -2 }],
  },
];

export const COURSES: CourseDef[] = [
  { id: 'candy', name: 'Candy Land', theme: 'candy', holes: CANDY },
  { id: 'jurassic', name: 'Jurassic Canyon', theme: 'jurassic', holes: JURASSIC },
  { id: 'space', name: 'Lunar Links', theme: 'space', holes: SPACE },
  { id: 'circus', name: 'Big Top Circus', theme: 'circus', holes: CIRCUS },
  { id: 'tomb', name: "Pharaoh's Tomb", theme: 'tomb', holes: TOMB },
  { id: 'arctic', name: 'Arctic Peaks', theme: 'arctic', holes: ARCTIC },
];
for (const c of COURSES) for (const h of c.holes) h.theme = c.theme;

/** The holes of the course being played. Reassigned by setCourse (importers see the live binding). */
export let LEVELS: LevelDef[] = CANDY;
export let COURSE: CourseDef = COURSES[0];
export function setCourse(id: string) {
  COURSE = COURSES.find((c) => c.id === id) ?? COURSES[0];
  LEVELS = COURSE.holes;
}
