// Synthesized sound — no audio files needed. Everything runs through a gentle
// compressor so stacked hits never clip.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let roll: { gain: GainNode; filter: BiquadFilterNode } | null = null;
export let soundOn = true;

export function setSound(on: boolean) {
  soundOn = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
}

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
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startRoll();
  }
  if (ctx.state === 'suspended') void ctx.resume();
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
  /** Rattle around the cup, then the drop. */
  sink: () => {
    [0, 0.07, 0.12, 0.155].forEach((at, i) => tone(1800 - i * 150, 0.04, 'triangle', 0.25 - i * 0.04, { at }));
    tone(160, 0.25, 'sine', 0.55, { at: 0.2, slideTo: 70 });
    noise(0.12, 0.3, 'lowpass', 600, { at: 0.2 });
  },
  lip: () => {
    tone(1700, 0.04, 'triangle', 0.2);
    tone(1500, 0.04, 'triangle', 0.14, { at: 0.06 });
  },
  water: () => {
    noise(0.12, 0.5, 'bandpass', 1800, { q: 0.8 });
    noise(0.7, 0.45, 'lowpass', 2500, { sweepTo: 200, at: 0.03, attack: 0.02 });
    tone(320, 0.25, 'sine', 0.2, { slideTo: 900, at: 0.04 });
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
  /** Short jingle that rises for good scores and sags for bad ones. */
  result: (toPar: number, holeInOne: boolean) => {
    const good = holeInOne ? [523, 659, 784, 1047, 1319] : toPar < 0 ? [523, 659, 784, 1047] : toPar === 0 ? [523, 659, 784] : [392, 370, 330];
    good.forEach((f, i) => tone(f, 0.28, 'triangle', 0.22, { at: 0.35 + i * 0.09 }));
  },
  ui: () => tone(900, 0.04, 'sine', 0.12),
};
