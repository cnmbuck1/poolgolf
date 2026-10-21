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
/** An elephant standing on a drum: a big solid obstacle. */
export interface Elephant { x: number; y: number; r?: number; angle?: number }
/** An impact crater: a bowl `depth` deep inside radius r, ringed by a raised rim `rim` high. */
export interface Crater { x: number; y: number; r: number; depth?: number; rim?: number }
export type Theme = 'garden' | 'jurassic' | 'space' | 'circus';

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

const GARDEN: LevelDef[] = [
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
    // Two volcanoes shoulder the fairway; their slopes push the ball away. A lava channel
    // runs behind the left one, and a gravel pit waits by the cup.
    name: 'Volcano Ridge',
    par: 3,
    tee: [100, 250],
    cup: [900, 250],
    outline: [[40, 160], [180, 40], [820, 40], [960, 160], [960, 340], [820, 460], [180, 460], [40, 340]],
    volcanoes: [{ x: 400, y: 205, r: 95 }, { x: 620, y: 300, r: 95 }],
    water: [creek([[250, 40], [330, 60], [440, 50], [520, 40]], 50, 5)],
    sand: [blob(810, 140, 55, 30, 7, 0.2, 20)],
    rocks: [{ x: 520, y: 250, r: 18 }],
    palms: [{ x: 250, y: 330 }, { x: 790, y: 360, height: 140 }],
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
    // A dogleg round a giant crater; an alien hops round its rim, and the green sits beyond.
    name: 'Crater Hop',
    par: 3,
    tee: [100, 400],
    cup: [870, 130],
    outline: [[40, 330], [130, 280], [500, 270], [580, 60], [960, 60], [960, 330], [880, 470], [40, 470]],
    craters: [{ x: 700, y: 330, r: 95, depth: 10, rim: 5 }, { x: 735, y: 190, r: 40 }],
    aliens: [{ x: 700, y: 330, orbit: 115, speed: 0.7 }],
    rocks: [{ x: 380, y: 420, r: 22 }, { x: 640, y: 120, r: 20 }],
    palms: [{ x: 480, y: 395 }, { x: 790, y: 105, height: 95 }],
    water: [blob(300, 330, 55, 22, 3, 0.25, 5)],
    slopes: [{ kind: 'hill', x: 870, y: 130, r: 60, h: -2.5 }],
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
    // The finale: an asteroid stream, an astronaut on patrol, a crack into space with one bridge,
    // and a rocket landing on the raised green.
    name: 'Lunar Landing',
    par: 4,
    tee: [100, 250],
    cup: [905, 250],
    outline: [[40, 150], [160, 40], [840, 40], [960, 150], [960, 350], [840, 460], [160, 460], [40, 350]],
    asteroids: [{ a: [290, 70], b: [290, 430], speed: 110, r: 22 }, { a: [390, 430], b: [390, 70], speed: 90, r: 18, phase: 0.5 }],
    astronauts: [{ a: [530, 120], b: [530, 380], speed: 50, phase: 0.3 }],
    water: [creek([[700, 40], [670, 160], [720, 300], [690, 460]], 64, 8)],
    bridges: [{ x: 700, y: 250, len: 140, width: 60, angle: 5 }],
    rockets: [{ x: 835, y: 250, period: 10, phase: 0.4 }],
    meteors: [{ x: 160, y: 360, r: 20, period: 9, phase: 0.2 }],
    craters: [{ x: 200, y: 140, r: 55 }, { x: 450, y: 250, r: 45 }, { x: 790, y: 385, r: 40 }],
    rocks: [{ x: 600, y: 420, r: 20 }],
    palms: [{ x: 610, y: 110 }],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 140, h: 5 }],
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
    // The human cannonball: roll into the cannon and it fires you across the tent. It swings, so time it:
    // too early or too late and you're out of the ring. The long way round is safe but slow.
    name: 'Human Cannonball',
    par: 4,
    tee: [100, 400],
    cup: [880, 140],
    outline: [[40, 330], [140, 290], [560, 290], [620, 60], [960, 60], [960, 330], [880, 470], [40, 470]],
    cannons: [{ x: 430, y: 380, angle: -20, sweep: 25, speed: 0.9, dist: 470 }],
    elephants: [{ x: 680, y: 390, r: 36, angle: 160 }],
    clowns: [{ a: [780, 90], b: [780, 300], speed: 55 }],
    slopes: [{ kind: 'hill', x: 880, y: 140, r: 60, h: -2.5 }],
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
    par: 3,
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
    par: 4,
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

export interface CourseDef { id: string; name: string; theme: Theme; holes: LevelDef[] }

export const COURSES: CourseDef[] = [
  { id: 'garden', name: 'Garden Club', theme: 'garden', holes: GARDEN },
  { id: 'jurassic', name: 'Jurassic Canyon', theme: 'jurassic', holes: JURASSIC },
  { id: 'space', name: 'Lunar Links', theme: 'space', holes: SPACE },
  { id: 'circus', name: 'Big Top Circus', theme: 'circus', holes: CIRCUS },
];
for (const c of COURSES) for (const h of c.holes) h.theme = c.theme;

/** The holes of the course being played. Reassigned by setCourse (importers see the live binding). */
export let LEVELS: LevelDef[] = GARDEN;
export let COURSE: CourseDef = COURSES[0];
export function setCourse(id: string) {
  COURSE = COURSES.find((c) => c.id === id) ?? COURSES[0];
  LEVELS = COURSE.holes;
}
