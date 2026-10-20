// Course data. Coordinates are table-plane units (the ball has radius 12); holes without an
// outline use the original WORLD_W x WORLD_H rectangle.

export const WORLD_W = 1000;
export const WORLD_H = 500;

export type Pt = [number, number];

export type Zone =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

export interface Bar { x: number; y: number; len: number; angle: number } // angle in degrees
export interface Bumper { x: number; y: number; r: number; color: string; n: number }
export interface Spinner { x: number; y: number; len: number; speed: number } // speed in rad/s

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
  water?: Zone[];
  sand?: Zone[];
  /** Fairway border: centre line of the edging, as a closed polygon. Defaults to the original rectangle. */
  outline?: Pt[];
  slopes?: Slope[];
  /** Visual treatment. 'premium' uses the detailed models from art.ts (Hole 1 is the benchmark). */
  art?: 'premium';
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
    spinners: [{ x: 700, y: 265, len: 82, speed: 0.8 }],
    slopes: [
      { kind: 'tilt', x: 150, y: 270, w: 420, h: 200, dir: 90, drop: 4, feather: 50 },
      { kind: 'hill', x: 620, y: 112, r: 80, h: 6 },
      { kind: 'hill', x: 895, y: 350, r: 60, h: -2.5 },
    ],
  },
  {
    name: 'Bank Street',
    par: 2,
    tee: [130, 110],
    cup: [870, 110],
    walls: [[[500, 0], [500, 330]]],
    sand: [{ kind: 'circle', x: 500, y: 440, r: 46 }],
  },
  {
    name: 'Bumper Pool',
    par: 3,
    tee: [110, 250],
    cup: [890, 250],
    bumpers: [
      ball(1, 380, 160), ball(2, 380, 340),
      ball(3, 500, 250), ball(4, 500, 90), ball(5, 500, 410),
      ball(6, 620, 160), ball(7, 620, 340),
      ball(8, 760, 250, 22),
    ],
  },
  {
    name: 'Water Hazard',
    par: 3,
    tee: [110, 400],
    cup: [880, 110],
    water: [
      { kind: 'rect', x: 300, y: 150, w: 420, h: 200 },
      { kind: 'circle', x: 880, y: 330, r: 70 },
    ],
    sand: [
      { kind: 'circle', x: 760, y: 70, r: 40 },
      { kind: 'circle', x: 230, y: 90, r: 50 },
    ],
    bars: [{ x: 510, y: 430, len: 160, angle: 0 }],
  },
  {
    name: 'Windmills',
    par: 4,
    tee: [100, 420],
    cup: [900, 75],
    walls: [
      [[0, 330], [680, 330]],
      [[320, 160], [1000, 160]],
    ],
    spinners: [
      { x: 470, y: 421, len: 55, speed: -1.6 },
      { x: 560, y: 245, len: 50, speed: 1.8 },
    ],
    bumpers: [ball(8, 860, 420, 20)],
  },
  {
    name: 'The Rack',
    par: 4,
    tee: [110, 250],
    cup: [905, 250],
    bars: [
      { x: 330, y: 90, len: 200, angle: 35 },
      { x: 330, y: 410, len: 200, angle: -35 },
    ],
    walls: [[[960, 150], [840, 150]], [[960, 350], [840, 350]]],
    bumpers: [
      ball(1, 640, 250),
      ball(2, 672, 231), ball(3, 672, 269),
      ball(4, 704, 212), ball(8, 704, 250), ball(5, 704, 288),
      ball(6, 736, 193), ball(7, 736, 231), ball(1, 736, 269), ball(2, 736, 307),
    ],
    spinners: [{ x: 500, y: 250, len: 60, speed: 1.3 }],
  },
];
