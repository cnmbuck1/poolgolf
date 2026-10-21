// The "how to play" demo on the main menu: a short scripted hole that shows aiming by pulling back, the
// guide, spin, and a curving shot into the cup. Played by the real game (main.ts drives the aim, cue and
// spin pad), on this little hole with a gumdrop in the way.
import { LevelDef } from './levels';

export const DEMO_LEVEL: LevelDef = {
  name: 'How to play',
  par: 2,
  theme: 'candy',
  tee: [170, 250],
  cup: [790, 250],
  outline: [[90, 130], [150, 70], [850, 70], [910, 130], [910, 370], [850, 430], [150, 430], [90, 370]],
  bumpers: [{ x: 480, y: 250, r: 22, color: '#ff7eb6', n: 1 }],
  palms: [{ x: 300, y: 120 }, { x: 640, y: 390 }],
  slopes: [{ kind: 'hill', x: 790, y: 250, r: 60, h: -2.5 }],
};

/** The shot the demo plays: aim angle (degrees), power, and side spin that curves it round the gumdrop. */
export const DEMO_SHOT = { deg: -16, power: 0.56, side: 0.7 };
