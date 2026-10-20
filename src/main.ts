import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { LEVELS } from './levels';
import { MAX_SHOT_SPEED, World } from './physics';
import { AimState, computeView, FX, render, View } from './render';
import { setSound, sfx, soundOn, unlockAudio } from './audio';

const MAX_STROKES = 10;
const native = Capacitor.isNativePlatform();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const g = canvas.getContext('2d')!;

type Phase = 'title' | 'play' | 'paused' | 'holeDone';

let phase: Phase = 'title';
let holeIdx = 0;
let world = new World(LEVELS[0]);
let strokes = 0;
let scores: (number | null)[] = LEVELS.map(() => null);
let lastRest = { x: 0, y: 0 };
let view: View = { scale: 1, ox: 0, oy: 0, dpr: 1 };
const aim: AimState = { active: false, dx: 1, dy: 0, power: 0 };
const fx: FX = { ripples: [] };
let drag: { id: number; sx: number; sy: number } | null = null;
let busyTimer = 0; // seconds remaining in a scripted sequence (sinking / splash reset)
let time = 0;

// ---------- Haptics ----------
function buzz(style: ImpactStyle) {
  if (native) void Haptics.impact({ style }).catch(() => {});
  else navigator.vibrate?.(style === ImpactStyle.Heavy ? 30 : 12);
}
if (native) void StatusBar.hide().catch(() => {});

// ---------- Layout ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const bar = document.querySelector('.hud-bar')!.getBoundingClientRect();
  const top = bar.bottom > 0 ? bar.bottom + 2 : 60;
  const bottom = window.innerHeight - document.querySelector('.power')!.getBoundingClientRect().top;
  view = computeView(window.innerWidth, window.innerHeight, dpr, top, bottom > 0 && bottom < 120 ? bottom + 4 : 36);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- HUD ----------
const pad2 = (n: number) => String(n).padStart(2, '0');
function updateHud() {
  $('hud-hole').textContent = pad2(holeIdx + 1);
  $('hud-par').textContent = String(world.level.par);
  $('hud-strokes').textContent = String(strokes);
  $('hud-name').textContent = world.level.name;
  const fill = $('power-fill');
  fill.style.width = `${Math.round(aim.power * 100)}%`;
  fill.classList.toggle('max', aim.power >= 0.99);
  $('hint').style.opacity = strokes === 0 && !aim.active ? '1' : '0';
}

let toastTimer = 0;
function toast(msg: string, ms = 1200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

function show(id: string | null) {
  for (const s of ['screen-title', 'screen-pause', 'screen-hole']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', phase === 'title');
}

// ---------- Flow ----------
function loadHole(i: number) {
  holeIdx = i;
  world = new World(LEVELS[i]);
  strokes = 0;
  lastRest = { x: world.ball.x, y: world.ball.y };
  fx.sink = undefined;
  fx.splash = undefined;
  fx.ripples = [];
  aim.active = false;
  aim.power = 0;
  drag = null;
  busyTimer = 0;
  phase = 'play';
  show(null);
  resize();
  updateHud();
  toast(`Hole ${i + 1} · ${LEVELS[i].name} · Par ${LEVELS[i].par}`, 1600);
}

function startRound() {
  scores = LEVELS.map(() => null);
  loadHole(0);
}

function resultName(s: number, par: number) {
  if (s === 1) return 'Hole in One!';
  const d = s - par;
  return ({ [-3]: 'Albatross!', [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double Bogey', 3: 'Triple Bogey' } as Record<number, string>)[d] ?? `+${d}`;
}

function finishHole(score: number, pickedUp = false) {
  scores[holeIdx] = score;
  phase = 'holeDone';
  const last = holeIdx === LEVELS.length - 1;
  const par = world.level.par;
  $('hole-result').textContent = pickedUp ? 'Picked up' : resultName(score, par);
  $('hole-detail').textContent = `${world.level.name} · ${score} stroke${score === 1 ? '' : 's'} · Par ${par}`;
  $('hole-card').innerHTML = scorecardHtml();
  $('btn-next').textContent = last ? 'Play again' : 'Next hole';
  if (last) {
    const total = scores.reduce<number>((a, b) => a + (b ?? 0), 0);
    const parTotal = LEVELS.reduce((a, l) => a + l.par, 0);
    const d = total - parTotal;
    $('hole-result').textContent = 'Round complete';
    $('hole-detail').textContent = `Total ${total} (${d === 0 ? 'E' : d > 0 ? `+${d}` : d})`;
    const best = Number(localGet('best') ?? Infinity);
    if (total < best) { localSet('best', String(total)); $('hole-detail').textContent += ' · New best!'; }
  }
  show('screen-hole');
}

function scorecardHtml() {
  const head = LEVELS.map((_, i) => `<td class="${i === holeIdx ? 'cur' : ''}">${i + 1}</td>`).join('');
  const par = LEVELS.map((l) => `<td>${l.par}</td>`).join('');
  const sc = LEVELS.map((l, i) => {
    const s = scores[i];
    const cls = s == null ? '' : s < l.par ? 'under' : s > l.par ? 'over' : '';
    return `<td class="${cls}">${s ?? '–'}</td>`;
  }).join('');
  const total = scores.reduce<number>((a, b) => a + (b ?? 0), 0);
  const parTotal = LEVELS.reduce((a, l) => a + l.par, 0);
  return `<table class="card">
    <tr><th>Hole</th>${head}<th>Tot</th></tr>
    <tr><th>Par</th>${par}<td>${parTotal}</td></tr>
    <tr><th>You</th>${sc}<td><b>${total}</b></td></tr></table>`;
}

function localGet(k: string) { try { return localStorage.getItem(`poolgolf.${k}`); } catch { return null; } }
function localSet(k: string, v: string) { try { localStorage.setItem(`poolgolf.${k}`, v); } catch { /* ignore */ } }

function refreshTitle() {
  const best = localGet('best');
  $('best').textContent = best ? `Best round: ${best}` : '';
}

// ---------- Input ----------
const canAim = () => phase === 'play' && !world.moving && busyTimer <= 0;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!canAim() || drag) return;
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  aim.active = true;
  aim.power = 0;
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  // Pull back like a cue: the shot goes opposite to the drag.
  const dx = drag.sx - e.clientX;
  const dy = drag.sy - e.clientY;
  const len = Math.hypot(dx, dy);
  const maxDrag = Math.min(window.innerHeight * 0.45, 260);
  if (len > 4) { aim.dx = dx / len; aim.dy = dy / len; }
  aim.power = Math.min(1, len / maxDrag);
  updateHud();
});

function endDrag(e: PointerEvent, cancel: boolean) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  const p = aim.power;
  aim.active = false;
  aim.power = 0;
  if (!cancel && p > 0.05 && canAim()) {
    lastRest = { x: world.ball.x, y: world.ball.y };
    const speed = MAX_SHOT_SPEED * p * p * 0.35 + MAX_SHOT_SPEED * p * 0.65; // finer control at low power
    world.shoot(aim.dx * speed, aim.dy * speed);
    strokes++;
    sfx.cue(p);
    buzz(p > 0.7 ? ImpactStyle.Heavy : ImpactStyle.Light);
  }
  updateHud();
}
canvas.addEventListener('pointerup', (e) => endDrag(e, false));
canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

$('btn-play').onclick = () => { unlockAudio(); startRound(); };
$('btn-pause').onclick = () => { if (phase === 'play') { phase = 'paused'; show('screen-pause'); } };
$('btn-resume').onclick = () => { phase = 'play'; show(null); };
$('btn-restart').onclick = () => { if (phase === 'play') loadHole(holeIdx); };
$('btn-pause-restart').onclick = () => loadHole(holeIdx);
$('btn-quit').onclick = () => { phase = 'title'; refreshTitle(); show('screen-title'); };
$('btn-sound').onclick = () => { setSound(!soundOn); $('btn-sound').textContent = `Sound: ${soundOn ? 'On' : 'Off'}`; localSet('sound', soundOn ? '1' : '0'); };
$('btn-next').onclick = () => (holeIdx === LEVELS.length - 1 ? startRound() : loadHole(holeIdx + 1));
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'play') { phase = 'paused'; show('screen-pause'); } });

if (localGet('sound') === '0') { setSound(false); $('btn-sound').textContent = 'Sound: Off'; }

// ---------- Loop ----------
let prev = performance.now();
function frame(now: number) {
  const dt = Math.min(1 / 30, (now - prev) / 1000);
  prev = now;
  time += dt;

  if (phase === 'play' || phase === 'title') tick(dt);
  render(g, view, world, aim, fx, time);
  requestAnimationFrame(frame);
}

function tick(dt: number) {
  for (const r of fx.ripples) r.t += dt * 1.5;
  fx.ripples = fx.ripples.filter((r) => r.t < 1);

  if (busyTimer > 0) {
    busyTimer -= dt;
    if (fx.sink) fx.sink.t += dt / 0.35;
    if (fx.splash) fx.splash.t += dt;
    if (busyTimer <= 0) {
      if (fx.sink) finishHole(strokes);
      else if (fx.splash) {
        fx.splash = undefined;
        world.ball.x = lastRest.x;
        world.ball.y = lastRest.y;
        if (strokes >= MAX_STROKES) finishHole(MAX_STROKES, true);
      }
    }
    // Spinners keep turning during sequences
    world.step(dt);
    return;
  }

  if (phase === 'title') { world.step(dt); return; }

  for (const ev of world.step(dt)) {
    switch (ev.type) {
      case 'wall': sfx.wall(ev.speed); if (ev.speed > 300) buzz(ImpactStyle.Light); break;
      case 'bumper': sfx.bumper(ev.speed); buzz(ImpactStyle.Medium); break;
      case 'spinner': sfx.spinner(ev.speed); buzz(ImpactStyle.Medium); break;
      case 'sink':
        sfx.sink();
        if (native) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        fx.sink = { t: 0 };
        busyTimer = 0.9;
        toast(resultName(strokes, world.level.par), 900);
        break;
      case 'water':
        sfx.water();
        buzz(ImpactStyle.Heavy);
        fx.splash = { x: world.ball.x, y: world.ball.y, t: 0 };
        fx.ripples.push({ x: world.ball.x, y: world.ball.y, t: 0 }, { x: world.ball.x, y: world.ball.y, t: -0.25 });
        strokes++;
        busyTimer = 0.9;
        toast('Splash! +1 stroke');
        updateHud();
        break;
      case 'stop':
        if (strokes >= MAX_STROKES) finishHole(MAX_STROKES, true);
        break;
    }
  }
}

// Dev-only hook for automated play-testing.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pg = {
    load: loadHole,
    shoot: (angleDeg: number, power: number) => {
      const a = (angleDeg * Math.PI) / 180;
      strokes++;
      world.shoot(Math.cos(a) * MAX_SHOT_SPEED * power, Math.sin(a) * MAX_SHOT_SPEED * power);
    },
    state: () => ({ phase, holeIdx, strokes, ball: { ...world.ball }, moving: world.moving }),
  };
}

refreshTitle();
resize();
show('screen-title');
requestAnimationFrame(frame);
