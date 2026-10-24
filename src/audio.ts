// Synthesized sound — no audio files needed. Everything runs through a gentle
// compressor so stacked hits never clip.

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // sound effects
let musicBus: GainNode | null = null; // background music (its own on/off)
let noiseBuf: AudioBuffer | null = null;
let roll: { gain: GainNode; filter: BiquadFilterNode } | null = null;
export let soundOn = true;
export let musicOn = true;
const MUSIC_LEVEL = 0.5;

export function setSound(on: boolean) {
  soundOn = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
}
export function setMusic(on: boolean) {
  musicOn = on;
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ctx.currentTime, 0.3);
}
/** The audio context and the music bus, once the player has tapped (for music.ts). */
export const audioOut = () => (ctx && musicBus ? { ctx, bus: musicBus, noise: noiseBuf! } : null);

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = soundOn ? 0.9 : 0;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? MUSIC_LEVEL : 0;
    musicBus.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startRoll();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Silence everything while the game is in the background (and pick up again on return). */
export function setAudioPaused(paused: boolean) {
  if (!ctx) return;
  if (paused) void ctx.suspend();
  else void ctx.resume();
}

const now = () => ctx!.currentTime;

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq: number, decay: number, type: OscillatorType, vol: number, opts: { at?: number; slideTo?: number; attack?: number } = {}) {
  if (!ctx || !master) return;
  const t = now() + (opts.at ?? 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + decay);
  env(g, t, vol, opts.attack ?? 0.002, decay);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + decay + 0.05);
}

/** A tone with vibrato (for trumpets, groans and whistles). */
function warble(freq: number, decay: number, type: OscillatorType, vol: number, opts: { at?: number; slideTo?: number; attack?: number; rate?: number; depth?: number; filter?: number } = {}) {
  if (!ctx || !master) return;
  const t = now() + (opts.at ?? 0);
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + decay);
  lfo.frequency.value = opts.rate ?? 6;
  lg.gain.value = (opts.depth ?? 0.03) * freq;
  lfo.connect(lg).connect(o.frequency);
  env(g, t, vol, opts.attack ?? 0.03, decay);
  let out: AudioNode = o;
  if (opts.filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; o.connect(f); out = f; }
  out.connect(g).connect(master);
  o.start(t); lfo.start(t);
  o.stop(t + decay + 0.1); lfo.stop(t + decay + 0.1);
}

function noise(decay: number, vol: number, type: BiquadFilterType, freq: number, opts: { at?: number; q?: number; sweepTo?: number; attack?: number } = {}) {
  if (!ctx || !master || !noiseBuf) return;
  const t = now() + (opts.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + decay);
  f.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  env(g, t, vol, opts.attack ?? 0.002, decay);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + decay + 0.05);
}

/** Continuous felt-rolling rumble whose level follows the ball speed. */
function startRoll() {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  roll = { gain, filter };
}

export function setRolling(speed: number, sand: boolean) {
  if (!ctx || !roll) return;
  const s = Math.min(1, speed / 1200);
  const level = speed < 8 ? 0 : (sand ? 0.22 : 0.1) * Math.sqrt(s);
  roll.gain.gain.setTargetAtTime(level, now(), 0.05);
  roll.filter.frequency.setTargetAtTime(sand ? 1600 + s * 1500 : 180 + s * 520, now(), 0.05);
}

const v = (speed: number) => Math.min(1, Math.max(0.08, speed / 1000));

export const sfx = {
  /** Leather tip on the cue ball: a woody click with a short body. */
  cue: (power: number) => {
    tone(1250, 0.035, 'triangle', 0.25 + power * 0.35);
    tone(2900, 0.02, 'sine', 0.12 + power * 0.15);
    noise(0.05, 0.25 + power * 0.4, 'bandpass', 2600, { q: 1.4 });
  },
  /** Ball into the felt cushion: soft, low thump. */
  rail: (speed: number) => {
    tone(140, 0.12, 'sine', 0.45 * v(speed), { slideTo: 90 });
    noise(0.06, 0.25 * v(speed), 'lowpass', 900);
  },
  /** Ball against a wooden wall: hollow knock. */
  wall: (speed: number) => {
    tone(420 + Math.random() * 40, 0.07, 'triangle', 0.4 * v(speed));
    tone(230, 0.12, 'sine', 0.3 * v(speed));
    noise(0.04, 0.3 * v(speed), 'bandpass', 1500, { q: 3 });
  },
  /** Ball on ball: the classic glassy clack. */
  bumper: (speed: number) => {
    const p = 1 + (Math.random() - 0.5) * 0.08;
    tone(2600 * p, 0.05, 'sine', 0.45 * v(speed));
    tone(3900 * p, 0.03, 'sine', 0.22 * v(speed));
    noise(0.025, 0.35 * v(speed), 'highpass', 3000);
  },
  /** Spinner arm: plastic thwack with a short ring. */
  spinner: (speed: number) => {
    tone(700, 0.09, 'square', 0.12 * v(speed), { slideTo: 380 });
    noise(0.05, 0.3 * v(speed), 'bandpass', 1200, { q: 2 });
  },
  /** Rattle round the rim, then the hollow clunk of the ball dropping to the bottom of the cup. */
  sink: () => {
    [0, 0.07, 0.12, 0.155].forEach((at, i) => tone(1800 - i * 150, 0.04, 'triangle', 0.25 - i * 0.04, { at }));
    tone(160, 0.25, 'sine', 0.55, { at: 0.2, slideTo: 70 });
    noise(0.12, 0.3, 'lowpass', 600, { at: 0.2 });
    tone(520, 0.09, 'triangle', 0.3, { at: 0.22, slideTo: 380 }); // the cup's "tok"
    tone(240, 0.06, 'sine', 0.18, { at: 0.34, slideTo: 200 }); // a little settle
  },
  /**
   * The crowd reacts to holing out: 0 a polite smattering, 1 applause, 2 cheers and a whistle,
   * 3 (a hole in one) a roar. Clapping is lots of tiny noise bursts; the roar is swelling filtered noise.
   */
  cheer: (level: number) => {
    const claps = [10, 28, 45, 70][level], len = [0.9, 1.6, 2.2, 3][level];
    for (let i = 0; i < claps; i++) noise(0.03, 0.14 + Math.random() * 0.1, 'bandpass', 1500 + Math.random() * 1500, { at: 0.25 + Math.random() * len, q: 1.5 });
    if (level >= 1) noise(len, 0.12 + level * 0.06, 'bandpass', 900, { at: 0.2, attack: 0.4, q: 0.7 });
    if (level >= 2) {
      warble(1900, 0.5, 'sine', 0.1, { at: 0.5, slideTo: 2600, depth: 0.01 }); // a whistle
      noise(len * 0.8, 0.12, 'bandpass', 450, { at: 0.3, attack: 0.3, q: 1.2 }); // "yeahhh"
    }
    if (level >= 3) {
      warble(1700, 0.35, 'sine', 0.1, { at: 1.1 }); warble(2300, 0.4, 'sine', 0.08, { at: 1.3, slideTo: 1800 });
      noise(2.4, 0.18, 'lowpass', 1600, { at: 0.2, attack: 0.5 });
    }
  },
  /** A sympathetic "ohhh" from the crowd. */
  groan: () => {
    noise(1.1, 0.16, 'bandpass', 520, { at: 0.2, attack: 0.25, q: 3, sweepTo: 380 });
    noise(1.1, 0.1, 'bandpass', 1050, { at: 0.2, attack: 0.25, q: 3, sweepTo: 760 });
  },
  /** The ball dropping into sand: a soft, gritty crunch. */
  sand: (speed: number) => {
    noise(0.22, 0.35 * v(speed), 'bandpass', 2200, { q: 0.8, sweepTo: 900 });
    noise(0.12, 0.25 * v(speed), 'lowpass', 400);
  },
  /** Obstacle characters react when the ball hits them. */
  elephant: () => {
    warble(320, 0.7, 'sawtooth', 0.22, { slideTo: 760, rate: 9, depth: 0.04, filter: 2200, attack: 0.05 });
    noise(0.5, 0.12, 'bandpass', 1400, { q: 2, attack: 0.05 });
  },
  clown: () => {
    for (const at of [0, 0.22]) { tone(430, 0.14, 'square', 0.12, { at }); tone(452, 0.14, 'square', 0.1, { at }); }
  },
  roar: () => {
    warble(130, 0.9, 'sawtooth', 0.3, { slideTo: 70, rate: 22, depth: 0.08, filter: 700, attack: 0.08 });
    noise(0.8, 0.25, 'lowpass', 500, { attack: 0.08, sweepTo: 200 });
  },
  groanMummy: () => {
    warble(150, 1.0, 'sine', 0.3, { slideTo: 95, rate: 5, depth: 0.06, attack: 0.15 });
    noise(0.9, 0.1, 'bandpass', 600, { q: 2, attack: 0.2 });
  },
  alien: () => {
    [0, 0.06, 0.12, 0.18].forEach((at, i) => warble(700 + i * 260, 0.08, 'sine', 0.14, { at, rate: 30, depth: 0.1 }));
  },
  astronaut: () => {
    tone(1250, 0.07, 'sine', 0.15);
    tone(1250, 0.07, 'sine', 0.15, { at: 0.12 });
    noise(0.15, 0.06, 'bandpass', 2500, { at: 0.2, q: 3 }); // radio crackle
  },
  rustle: () => {
    noise(0.35, 0.12, 'highpass', 3500, { attack: 0.05 });
    noise(0.25, 0.08, 'highpass', 5000, { at: 0.08, attack: 0.04 });
  },
  lip: () => {
    tone(1700, 0.04, 'triangle', 0.2);
    tone(1500, 0.04, 'triangle', 0.14, { at: 0.06 });
  },
  /** The ball plunging into water: a plop, the splash, then droplets falling back. */
  water: () => {
    noise(0.12, 0.5, 'bandpass', 1800, { q: 0.8 });
    noise(0.7, 0.45, 'lowpass', 2500, { sweepTo: 200, at: 0.03, attack: 0.02 });
    tone(320, 0.25, 'sine', 0.2, { slideTo: 900, at: 0.04 });
    for (let i = 0; i < 6; i++) tone(1400 + Math.random() * 1600, 0.05, 'sine', 0.06, { at: 0.25 + Math.random() * 0.5, slideTo: 2800 });
  },
  /** Hiss and bubble as the ball drops into lava. */
  lava: () => {
    noise(0.9, 0.45, 'highpass', 2500, { sweepTo: 6000, attack: 0.02 });
    noise(0.5, 0.4, 'lowpass', 300, { at: 0.05 });
    [0.15, 0.32, 0.5].forEach((at) => tone(120 + Math.random() * 60, 0.12, 'sine', 0.25, { at, slideTo: 60 }));
  },
  /** A falling "wooo" and sparkle as the ball drops into space. */
  warp: () => {
    tone(900, 0.8, 'sine', 0.22, { slideTo: 120 });
    tone(1350, 0.6, 'triangle', 0.08, { slideTo: 200, at: 0.05 });
    [0.1, 0.22, 0.34, 0.46].forEach((at, i) => tone(2400 + i * 300, 0.06, 'sine', 0.08, { at }));
  },
  /** Trampoline: a springy boing. */
  boing: () => {
    tone(220, 0.35, 'sine', 0.4, { slideTo: 660 });
    tone(330, 0.25, 'triangle', 0.12, { slideTo: 990, at: 0.02 });
  },
  /** Cannon: a deep boom with a puff of noise. */
  cannon: () => {
    tone(70, 0.5, 'sine', 0.6, { slideTo: 40 });
    noise(0.45, 0.55, 'lowpass', 900, { sweepTo: 150 });
  },
  /** Landing back on the felt. */
  land: () => {
    tone(160, 0.12, 'sine', 0.35, { slideTo: 90 });
    noise(0.06, 0.25, 'lowpass', 700);
  },
  /** Out of bounds: a referee's whistle. */
  whistle: () => {
    tone(2600, 0.18, 'square', 0.08, { slideTo: 2500 });
    tone(2600, 0.32, 'square', 0.08, { at: 0.22, slideTo: 2450 });
  },
  /** Scarab portal: a shimmering sweep. */
  portal: () => {
    [0, 0.05, 0.1, 0.15].forEach((at, i) => tone(900 + i * 280, 0.2, 'sine', 0.12, { at, slideTo: 1400 + i * 300 }));
    noise(0.3, 0.15, 'highpass', 4000, { sweepTo: 9000 });
  },
  /** Swallowed by quicksand: a slow, sinking slurp. */
  quicksand: () => {
    tone(260, 0.9, 'sine', 0.3, { slideTo: 60 });
    noise(0.8, 0.3, 'lowpass', 500, { sweepTo: 120 });
  },
  /** A seal's bark as its tail flips the ball. */
  seal: () => {
    for (const at of [0, 0.18]) warble(420, 0.14, 'sawtooth', 0.18, { at, slideTo: 300, rate: 30, depth: 0.05, filter: 1600, attack: 0.01 });
    tone(140, 0.12, 'sine', 0.3, { slideTo: 80 }); // the slap of the tail
  },
  /** Off a ski jump: a rising whoosh. */
  whoosh: () => noise(0.5, 0.3, 'bandpass', 600, { sweepTo: 3000, q: 1.5, attack: 0.05 }),
  /** Caught in a spider web: a sticky twang and a skitter of little legs. */
  web: () => {
    tone(220, 0.35, 'sawtooth', 0.12, { slideTo: 140 });
    for (let k = 0; k < 6; k++) noise(0.03, 0.12, 'highpass', 3000, { at: 0.12 + k * 0.05 });
  },
  /** A coffin lid creaking open. */
  creak: () => { tone(160, 0.5, 'sawtooth', 0.08, { slideTo: 230 }); tone(240, 0.4, 'triangle', 0.05, { at: 0.15, slideTo: 180 }); },
  /** A witch's broom: a rush of air and a quick cackle. */
  broom: () => {
    noise(0.8, 0.3, 'bandpass', 500, { sweepTo: 2600, q: 1.4, attack: 0.08 });
    [0, 0.11, 0.22, 0.33].forEach((at, i) => tone(880 - i * 60, 0.09, 'square', 0.05, { at: 0.1 + at, slideTo: 620 - i * 40 }));
  },
  /** Into a hole in the ice: a heavy plunk and a crackle of ice. */
  icewater: () => {
    noise(0.12, 0.45, 'bandpass', 1500, { q: 0.8 });
    noise(0.6, 0.4, 'lowpass', 1800, { sweepTo: 150, at: 0.03, attack: 0.02 });
    for (let i = 0; i < 5; i++) tone(3000 + Math.random() * 2500, 0.03, 'triangle', 0.05, { at: 0.1 + Math.random() * 0.4 });
  },
  /** Through an igloo: a hollow, echoing rumble. */
  igloo: () => {
    noise(0.5, 0.25, 'lowpass', 500, { attack: 0.05 });
    tone(180, 0.4, 'sine', 0.15, { slideTo: 120, at: 0.05 });
  },
  penguin: () => {
    for (const at of [0, 0.1, 0.2]) warble(700, 0.07, 'square', 0.08, { at, slideTo: 520, rate: 40, depth: 0.08, filter: 2500 });
  },
  bear: () => {
    warble(95, 0.9, 'sawtooth', 0.28, { slideTo: 70, rate: 18, depth: 0.1, filter: 500, attack: 0.1 });
    noise(0.7, 0.2, 'lowpass', 350, { attack: 0.1 });
  },
  /** Down a chute: a slide whistle swooping down, with a rush of air. */
  slide: () => {
    warble(1500, 1.1, 'sine', 0.16, { slideTo: 320, rate: 9, depth: 0.04, attack: 0.04 });
    noise(1.0, 0.12, 'bandpass', 2400, { sweepTo: 700, q: 1.2, attack: 0.1 });
  },
  /** Up a ladder: a xylophone run climbing the rungs. */
  ladder: () => {
    [523, 587, 659, 784, 880, 1047].forEach((f, i) => { tone(f, 0.12, 'triangle', 0.16, { at: i * 0.11 }); tone(f * 4, 0.04, 'sine', 0.04, { at: i * 0.11 }); });
  },
  /** A launch rocket: ignition crackle, then a roaring climb. */
  rocket: () => {
    noise(0.15, 0.3, 'bandpass', 3000, { q: 0.7 });
    noise(1.6, 0.4, 'lowpass', 300, { sweepTo: 1400, attack: 0.15, at: 0.08 });
    tone(70, 1.4, 'sawtooth', 0.12, { slideTo: 160, at: 0.08 });
  },
  /** A geyser: a gurgle from below, then a hissing burst of water. */
  geyser: () => {
    for (let i = 0; i < 4; i++) tone(120 + i * 30, 0.12, 'sine', 0.15, { at: i * 0.06, slideTo: 220 + i * 40 });
    noise(1.2, 0.35, 'highpass', 1500, { attack: 0.08, at: 0.2 });
    noise(0.9, 0.25, 'lowpass', 600, { at: 0.2, attack: 0.05 });
  },
  /** Off the edge of a cake layer: a little falling "whee". */
  drop: () => warble(900, 0.3, 'sine', 0.12, { slideTo: 420, rate: 12, depth: 0.03, attack: 0.01 }),
  /** A gingerbread man yelps when the ball bonks him. */
  gingerbread: () => {
    warble(820, 0.1, 'square', 0.08, { slideTo: 1200, rate: 30, depth: 0.05, filter: 3000 });
    warble(1100, 0.14, 'square', 0.07, { at: 0.11, slideTo: 700, rate: 30, depth: 0.05, filter: 3000 });
  },
  /** Santa's sleigh: a shake of sleigh bells and a jolly "ho ho". */
  sleigh: () => {
    for (let k = 0; k < 10; k++) { const at = k * 0.07; noise(0.05, 0.1, 'bandpass', 6500, { q: 6, at }); tone(2600 + (k % 3) * 340, 0.08, 'sine', 0.05, { at }); }
    for (const at of [0.2, 0.45]) warble(150, 0.18, 'sawtooth', 0.16, { at, slideTo: 120, rate: 14, depth: 0.06, filter: 900, attack: 0.02 });
  },
  /** Down a chimney: a sooty whoomp and a puff. */
  chimney: () => { tone(300, 0.45, 'sine', 0.2, { slideTo: 70 }); noise(0.4, 0.2, 'lowpass', 900, { sweepTo: 200, at: 0.05 }); },
  /** All aboard the toy train: two toots of the whistle and the clack of the wheels. */
  train: () => {
    for (const at of [0, 0.3]) { tone(740, 0.22, 'triangle', 0.12, { at }); tone(932, 0.22, 'triangle', 0.08, { at }); }
    for (let k = 0; k < 6; k++) noise(0.03, 0.12, 'bandpass', 1800, { q: 3, at: 0.6 + k * 0.12 });
  },
  /** A nutcracker soldier bonked: a hollow wooden clack. */
  nutcracker: () => { tone(620, 0.06, 'square', 0.1, { slideTo: 420 }); tone(880, 0.05, 'triangle', 0.08, { at: 0.07 }); },
  /** Short jingle that rises for good scores and sags for bad ones. */
  result: (toPar: number, holeInOne: boolean) => {
    const good = holeInOne ? [523, 659, 784, 1047, 1319] : toPar < 0 ? [523, 659, 784, 1047] : toPar === 0 ? [523, 659, 784] : [392, 370, 330];
    good.forEach((f, i) => tone(f, 0.28, 'triangle', 0.22, { at: 0.35 + i * 0.09 }));
  },
  /** Picking up a golden 8-ball: a bright rising sparkle of four notes. */
  collect: () => {
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.22, 'sine', 0.22, { at: i * 0.07 }));
    tone(3136, 0.35, 'triangle', 0.06, { at: 0.28 });
  },
  ui: () => tone(900, 0.04, 'sine', 0.12),
};
