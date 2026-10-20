// Course data. The playable felt is WORLD_W x WORLD_H units; the rails sit outside it.

export const WORLD_W = 1000;
export const WORLD_H = 500;

export type Pt = [number, number];

export type Zone =
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

export interface Bar { x: number; y: number; len: number; angle: number } // angle in degrees
export interface Bumper { x: number; y: number; r: number; color: string; n: number }
export interface Spinner { x: number; y: number; len: number; speed: number } // speed in rad/s

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
}

// Pool-ball colours for bumpers.
const BALL = {
  1: '#f2c230', 2: '#2d5fc4', 3: '#d8402f', 4: '#6a3fa0',
  5: '#ec7a2a', 6: '#2f8a4c', 7: '#8c2f2a', 8: '#1a1a1a',
} as const;
const ball = (n: keyof typeof BALL, x: number, y: number, r = 18): Bumper => ({ x, y, r, n, color: BALL[n] });

export const LEVELS: LevelDef[] = [
  {
    // Straight from the course concept art.
    name: 'Break Shot',
    par: 3,
    tee: [140, 370],
    cup: [870, 410],
    walls: [[[337, 0], [337, 285], [440, 285]]],
    bars: [{ x: 600, y: 265, len: 280, angle: 66 }],
    water: [{ kind: 'circle', x: 795, y: 220, r: 62 }],
    spinners: [{ x: 795, y: 220, len: 82, speed: 1.1 }],
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
