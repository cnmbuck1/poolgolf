// Tiny synthesized sound effects — no audio assets needed for the prototype.

let ctx: AudioContext | null = null;
export let soundOn = true;

export function setSound(on: boolean) { soundOn = on; }

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx?.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  if (!ctx || !soundOn) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

function noise(dur: number, vol: number, filterFreq: number) {
  if (!ctx || !soundOn) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

const vol = (speed: number) => Math.min(1, speed / 900);

export const sfx = {
  cue: (power: number) => { tone(900, 0.05, 'square', 0.12 + power * 0.2); noise(0.04, 0.3 * power + 0.1, 3000); },
  wall: (speed: number) => tone(220, 0.08, 'triangle', 0.25 * vol(speed)),
  bumper: (speed: number) => { tone(1500, 0.06, 'sine', 0.35 * vol(speed)); tone(2400, 0.03, 'sine', 0.15 * vol(speed)); },
  spinner: (speed: number) => tone(330, 0.1, 'sawtooth', 0.12 * vol(speed)),
  sink: () => { tone(500, 0.12, 'sine', 0.35, 180); setTimeout(() => tone(660, 0.15, 'sine', 0.25), 180); setTimeout(() => tone(880, 0.25, 'sine', 0.25), 320); },
  water: () => noise(0.5, 0.5, 900),
};
