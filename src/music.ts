// Background music, synthesized live (no audio files): a small step sequencer that plays chords, a
// bass line, a melody and drums in a style for each course. Notes are scheduled a little ahead on the
// audio clock so timing stays steady even when frames are slow.
import { audioOut } from './audio';

type Drums = 'none' | 'soft' | 'tribal' | 'pulse' | 'oompah' | 'darbuka';
interface Style {
  bpm: number;
  /** Steps per bar (16 = 4/4 in sixteenths, 12 = 3/4 waltz). */
  steps: number;
  root: number; // MIDI note of the key
  scale: number[]; // semitones from the root
  chords: number[]; // scale degree of each bar's chord root, looped
  lead: OscillatorType;
  leadVol: number;
  /** Plucky (short) or held lead notes. */
  pluck: number;
  bass: OscillatorType;
  pad?: OscillatorType;
  arp?: boolean;
  drums: Drums;
  /** Chance of a melody note on each eighth. */
  density: number;
  swing?: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR_PENT = [0, 3, 5, 7, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11], HIJAZ = [0, 1, 4, 5, 7, 8, 10], MAJOR_PENT = [0, 2, 4, 7, 9];

const STYLES: Record<string, Style> = {
  menu: { bpm: 90, steps: 16, root: 60, scale: MAJOR_PENT, chords: [0, 3, 4, 2], lead: 'triangle', leadVol: 0.1, pluck: 0.5, bass: 'sine', drums: 'soft', density: 0.35 },
  garden: { bpm: 108, steps: 16, root: 65, scale: MAJOR, chords: [0, 5, 3, 4], lead: 'triangle', leadVol: 0.11, pluck: 0.32, bass: 'sine', drums: 'soft', density: 0.5, swing: 0.12 },
  jurassic: { bpm: 100, steps: 16, root: 57, scale: MINOR_PENT, chords: [0, 4, 3, 4], lead: 'sine', leadVol: 0.16, pluck: 0.22, bass: 'triangle', drums: 'tribal', density: 0.55 },
  space: { bpm: 84, steps: 16, root: 62, scale: LYDIAN, chords: [0, 1, 0, 4], lead: 'sine', leadVol: 0.08, pluck: 0.9, bass: 'sine', pad: 'sawtooth', arp: true, drums: 'pulse', density: 0.25 },
  circus: { bpm: 168, steps: 12, root: 60, scale: MAJOR, chords: [0, 4, 4, 0, 3, 0, 4, 0], lead: 'square', leadVol: 0.06, pluck: 0.2, bass: 'sawtooth', drums: 'oompah', density: 0.75 },
  tomb: { bpm: 96, steps: 16, root: 62, scale: HIJAZ, chords: [0, 1, 0, 6], lead: 'sawtooth', leadVol: 0.06, pluck: 0.25, bass: 'triangle', drums: 'darbuka', density: 0.5 },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

let style: Style | null = null, styleName = '';
let step = 0, nextTime = 0, timer = 0;
let seed = 1;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
/** The melody: a phrase of scale steps, regenerated every few bars so it develops without wandering off. */
let phrase: (number | null)[] = [];

/** Switch the music to a course's style ('menu' for the menus); the same name again keeps playing. */
export function playMusic(name: string) {
  if (name === styleName) return;
  styleName = name;
  style = STYLES[name] ?? STYLES.menu;
  step = 0;
  seed = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  phrase = [];
  const out = audioOut();
  nextTime = out ? out.ctx.currentTime + 0.15 : 0;
  if (!timer) timer = window.setInterval(schedule, 40);
}

function makePhrase(s: Style) {
  const n = s.steps * 2;
  let deg = 2 + Math.floor(rand() * 3);
  phrase = [];
  for (let i = 0; i < n; i++) {
    const onBeat = i % 2 === 0;
    if (!onBeat || rand() > s.density) { phrase.push(null); continue; }
    deg += Math.round((rand() - 0.5) * 3.2); // mostly stepwise, the odd leap
    deg = Math.max(0, Math.min(s.scale.length * 2 - 1, deg));
    phrase.push(deg);
  }
}

/** Scale degree (may run past the octave) to a MIDI note. */
const noteOf = (s: Style, deg: number, octave = 0) => s.root + 12 * (Math.floor(deg / s.scale.length) + octave) + s.scale[((deg % s.scale.length) + s.scale.length) % s.scale.length];

function schedule() {
  const out = audioOut();
  if (!out || !style) return;
  const { ctx } = out;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05; // fell behind (tab was hidden): resync
  const s = style;
  const stepDur = 60 / s.bpm / (s.steps === 12 ? 3 : 4);
  while (nextTime < ctx.currentTime + 0.25) {
    playStep(s, step, nextTime + (s.swing && step % 2 ? s.swing * stepDur : 0), stepDur);
    nextTime += stepDur;
    step++;
  }
}

function playStep(s: Style, i: number, t: number, dur: number) {
  const bar = Math.floor(i / s.steps), pos = i % s.steps;
  const beat = s.steps === 12 ? 3 : 4, perBeat = s.steps / beat;
  if (pos === 0 && bar % 4 === 0) makePhrase(s);
  const chord = s.chords[bar % s.chords.length];
  // Bass: root on the downbeat (and the fifth halfway in 4/4); oom-pah for the waltz
  if (s.drums === 'oompah') {
    if (pos === 0) voice(s.bass, mtof(noteOf(s, chord, -2)), t, dur * 3, 0.16, 700);
    if (pos === perBeat || pos === perBeat * 2) chordStab(s, chord, t, dur * 2, 0.04);
  } else {
    if (pos === 0) voice(s.bass, mtof(noteOf(s, chord, -2)), t, dur * (s.steps / 2), 0.2, 500);
    if (pos === s.steps / 2) voice(s.bass, mtof(noteOf(s, chord + 4, -2)), t, dur * (s.steps / 2 - 1), 0.15, 500);
  }
  // Pads hold the chord through the bar; arpeggios ripple through it
  if (s.pad && pos === 0) for (const d of [0, 2, 4]) voice(s.pad, mtof(noteOf(s, chord + d, -1)), t, dur * s.steps, 0.035, 900, dur * 4);
  if (s.arp && pos % 2 === 0) voice('square', mtof(noteOf(s, chord + [0, 2, 4, 7][(pos / 2) % 4], 0)), t, dur * 1.6, 0.025, 2200);
  // Melody
  const m = phrase[(bar % 2) * s.steps + pos];
  if (m != null) {
    const f = mtof(noteOf(s, m, s.drums === 'tribal' ? 1 : 0));
    voice(s.lead, f, t, Math.max(dur * 1.2, s.pluck), s.leadVol, s.lead === 'sawtooth' ? 1800 : 4000);
    if (s.drums === 'tribal') voice('sine', f * 4, t, 0.05, s.leadVol * 0.4, 8000); // marimba click
    if (s.drums === 'oompah') voice('square', f * 2, t, Math.max(dur, s.pluck), s.leadVol * 0.5, 5000); // calliope octave
  }
  drums(s.drums, pos, perBeat, t, s.steps);
}

function chordStab(s: Style, chord: number, t: number, len: number, vol: number) {
  for (const d of [0, 2, 4]) voice('square', mtof(noteOf(s, chord + d, -1)), t, len, vol, 1600);
}

function drums(kind: Drums, pos: number, perBeat: number, t: number, steps: number) {
  const beatStart = pos % perBeat === 0;
  switch (kind) {
    case 'soft':
      if (pos === 0 || pos === steps / 2 + 2) kick(t, 0.22);
      if (pos === steps / 4 || pos === (steps * 3) / 4) hit(t, 0.06, 'bandpass', 1800, 0.12);
      if (pos % 2 === 0) hit(t, 0.025, 'highpass', 7000, 0.03);
      break;
    case 'tribal':
      if (pos === 0 || pos === 6 || pos === 10) tom(t, 110, 0.3);
      if (pos === 4 || pos === 12) tom(t, 165, 0.2);
      if (pos === 14) tom(t, 220, 0.15);
      break;
    case 'pulse':
      if (beatStart) kick(t, 0.08);
      break;
    case 'oompah':
      if (pos === 0) kick(t, 0.18);
      if (pos === perBeat || pos === perBeat * 2) hit(t, 0.05, 'highpass', 5000, 0.05);
      break;
    case 'darbuka':
      if (pos === 0 || pos === 6) tom(t, 90, 0.3); // doum
      if (pos === 4 || pos === 10 || pos === 12) hit(t, 0.05, 'bandpass', 2600, 0.12); // tek
      if (pos === 14) hit(t, 0.04, 'bandpass', 3200, 0.08);
      break;
  }
}

/** One synth note through a lowpass filter, with an optional slow attack (pads). */
function voice(type: OscillatorType, freq: number, t: number, len: number, vol: number, cutoff: number, attack = 0.005) {
  const out = audioOut();
  if (!out) return;
  const { ctx, bus } = out;
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, len));
  o.connect(f).connect(g).connect(bus);
  o.start(t);
  o.stop(t + len + 0.05);
}

function kick(t: number, vol: number) {
  const out = audioOut();
  if (!out) return;
  const { ctx, bus } = out;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + 0.25);
}

function tom(t: number, freq: number, vol: number) {
  const out = audioOut();
  if (!out) return;
  const { ctx, bus } = out;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.25);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + 0.35);
}

function hit(t: number, len: number, type: BiquadFilterType, freq: number, vol: number) {
  const out = audioOut();
  if (!out) return;
  const { ctx, bus, noise } = out;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(bus);
  src.start(t, Math.random()); src.stop(t + len + 0.02);
}
