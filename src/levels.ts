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
export interface Spinner { x: number; y: number; len: number; speed: number; style?: 'windmill' | 'turnstile' } // speed in rad/s
/** Plank footbridge: the ball can cross water on it. Centre, length along `angle` (degrees), deck width. */
export interface Bridge { x: number; y: number; len: number; width: number; angle: number }
/** A boulder: solid, and duller to bounce off than a wall. */
export interface Rock { x: number; y: number; r: number }

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

export const LEVELS: LevelDef[] = [
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
    spinners: [{ x: 700, y: 265, len: 82, speed: 0.8, style: 'windmill' }],
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
    water: [creek([[470, -20], [445, 110], [520, 250], [490, 380], [520, 520]], 74, 2)],
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
      { x: 470, y: 400, len: 55, speed: -1.3, style: 'turnstile' },
      { x: 560, y: 250, len: 50, speed: 1.5, style: 'turnstile' },
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
    spinners: [{ x: 500, y: 250, len: 60, speed: 1.1, style: 'turnstile' }],
    rocks: [{ x: 240, y: 250, r: 22 }],
    sand: [blob(700, 105, 70, 32, 7, 0.2, 10), blob(700, 395, 70, 32, 8, 0.2, -10)],
    slopes: [{ kind: 'hill', x: 905, y: 250, r: 150, h: 5 }],
  },
];
