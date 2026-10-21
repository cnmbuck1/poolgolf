import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { COURSE, COURSES, LEVELS, setCourse } from './levels';
import { inZone, MAX_SHOT_SPEED, World } from './physics';
import { AimState, CueState, FX, Renderer3D } from './render3d';
import { loadModels } from './models';
import { ballPreview, BALLS, cuePreview, CUES } from './gear';
import { bestScore, bestStars, CareerEvent, EVENTS, isUnlocked, recordEvent, STAR_COINS, starText, TIERS, totalStars } from './career';
import { HoleRecorder, sampleShot, Shot } from './replay';
import { addCoins, buy, coins, earn, holeReward, isOwned, itemInfo, ItemKey, roundReward } from './wallet';
import { setRolling, setSound, sfx, unlockAudio } from './audio';

const MAX_STROKES = 10;
/** Aim turn per pixel of sideways drag on the shot camera (radians). */
const AIM_TURN = 0.004;
const native = Capacitor.isNativePlatform();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const view3d = new Renderer3D(canvas);

type Phase = 'title' | 'play' | 'paused' | 'holeDone' | 'replay';

let phase: Phase = 'title';
let holeIdx = 0;
setCourse(localGet('course') ?? 'garden');
let world = new World(LEVELS[0]);
let strokes = 0;
let scores: (number | null)[] = LEVELS.map(() => null);
let lastRest = { x: 0, y: 0 };
const aim: AimState = { active: false, dx: 1, dy: 0, power: 0, guide: 'full' };
const cue: CueState = { visible: false, dx: 1, dy: 0, pull: 0, alpha: 0 };
const fx: FX = { ripples: [] };
let drag: { id: number; sx: number; sy: number; x: number; y: number; spin: number; basis: ReturnType<Renderer3D['aimBasis']> } | null = null;
let practice = false; // playing a single hole from the Courses menu
let busyTimer = 0; // seconds remaining in a scripted sequence (sinking / splash reset)
let time = 0;
let lastFrameDt = 1 / 60;
let sinkBanked = false; // the ball touched a wall or obstacle on the shot that sank it
const recorder = new HoleRecorder(); // this hole's shots, for the replay
let careerEvent: CareerEvent | null = null; // the Career event being played, if any

/** Cue strike: the cue slides into the ball, the shot fires on contact, then it follows through and fades. */
let strike: { t: number; from: number; dur: number; p: number; fired: boolean } | null = null;

// ---------- Settings ----------
function localGet(k: string) { try { return localStorage.getItem(`poolgolf.${k}`); } catch { return null; } }
function localSet(k: string, v: string) { try { localStorage.setItem(`poolgolf.${k}`, v); } catch { /* ignore */ } }

const settings = {
  sound: localGet('sound') !== '0',
  guide: localGet('guide') !== 'short',
  follow: localGet('follow') !== '0',
  arrows: localGet('arrows') !== '0',
  top: localGet('view') === 'table', // whole-table view instead of the shot camera
  tutorialDone: localGet('tutorial') === '1',
};
setSound(settings.sound);
aim.guide = settings.guide ? 'full' : 'short';
view3d.follow = settings.follow;
view3d.setSlopeArrows(settings.arrows);
view3d.setOverview(settings.top);
view3d.setBall(localGet('ball') ?? 'cue');
view3d.setCue(localGet('cue') ?? 'classic');

function syncSettingsUi() {
  $('set-sound').setAttribute('aria-pressed', String(settings.sound));
  $('set-guide').setAttribute('aria-pressed', String(settings.guide));
  $('set-follow').setAttribute('aria-pressed', String(settings.follow));
  $('set-arrows').setAttribute('aria-pressed', String(settings.arrows));
  $('view-label').textContent = view3d.isOverview ? 'BALL' : 'TABLE';
  const t = $('btn-title-sound');
  t.querySelector('use')!.setAttribute('href', settings.sound ? '#i-sound' : '#i-mute');
  t.setAttribute('aria-label', settings.sound ? 'Sound on' : 'Sound off');
}

/** Set a button's text while keeping its icon. */
function setLabel(id: string, text: string) {
  const b = $(id);
  if (b.firstChild?.nodeType === Node.TEXT_NODE) b.firstChild.textContent = text;
  else b.prepend(text);
}

// ---------- Stats ----------
const stat = (k: string) => Number(localGet(k) ?? 0);
/** Score keys per course (the Garden course keeps its original keys). */
const ck = (k: string, id = COURSE.id) => (id === 'garden' ? k : `${id}.${k}`);
function recordHole(i: number, score: number) {
  const best = localGet(ck(`hole${i}`));
  if (best == null || score < Number(best)) localSet(ck(`hole${i}`), String(score));
  if (score === 1) localSet('aces', String(stat('aces') + 1));
  localSet('holes', String(stat('holes') + 1));
}

// ---------- Haptics ----------
function buzz(style: ImpactStyle) {
  if (native) void Haptics.impact({ style }).catch(() => {});
  else navigator.vibrate?.(style === ImpactStyle.Heavy ? 30 : style === ImpactStyle.Medium ? 18 : 10);
}
if (native) void StatusBar.hide().catch(() => {});

// ---------- Layout ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const bar = document.querySelector('.hud-card')!.getBoundingClientRect();
  const top = bar.bottom > 0 ? bar.bottom + 2 : 60;
  const bottom = window.innerHeight - document.querySelector('.power')!.getBoundingClientRect().top;
  view3d.resize(window.innerWidth, window.innerHeight, dpr, top, bottom > 0 && bottom < 120 ? bottom + 4 : 40);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- Scoring helpers ----------
const parOf = (i: number) => LEVELS[i].par;
const toParLabel = (d: number) => (d === 0 ? 'E' : d > 0 ? `+${d}` : String(d));
function roundToPar() {
  return scores.reduce<number>((a, s, i) => a + (s == null ? 0 : s - parOf(i)), 0);
}
function resultName(s: number, par: number) {
  if (s === 1) return 'Hole in one!';
  const d = s - par;
  return ({ [-3]: 'Albatross!', [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' } as Record<number, string>)[d] ?? `+${d}`;
}
const scoreClass = (s: number, par: number) => (s === 1 ? 'ace' : s < par ? 'under' : s === par ? 'par' : 'over');

// ---------- HUD ----------
function updateHud() {
  $('hud-hole').textContent = String(holeIdx + 1);
  $('hud-par').textContent = String(world.level.par);
  $('hud-strokes').textContent = String(strokes);
  $('hud-name').textContent = world.level.name;
  const d = roundToPar();
  const tp = $('hud-topar');
  tp.textContent = toParLabel(d);
  tp.className = `num chip ${d < 0 ? 'under' : d > 0 ? 'over' : ''}`;
  $('hud-pips').innerHTML = LEVELS.map((l, i) => {
    const s = scores[i];
    const c = i === holeIdx && phase === 'play' ? 'cur' : s == null ? '' : s < l.par ? 'under' : s === l.par ? 'par' : 'over';
    return `<i class="${c}"></i>`;
  }).join('');
  updatePower();
  $('hint').style.opacity = strokes === 0 && !aim.active && !strike ? '1' : '0';
}

function updatePower() {
  const fill = $('power-fill');
  fill.style.width = `${Math.round(aim.power * 100)}%`;
  fill.classList.toggle('max', aim.power >= 0.99);
  $('power-pct').textContent = `${Math.round(aim.power * 100)}%`;
}

/** Fit the banner/toast slot into the top bar's gap between the score card and the buttons. */
function fitTopSlot() {
  const card = document.querySelector('.hud-card')!.getBoundingClientRect();
  const btns = document.querySelector('.hud-actions')!.getBoundingClientRect();
  const slot = $('top-slot');
  slot.style.left = `${card.right + 10}px`;
  slot.style.right = `${window.innerWidth - btns.left + 10}px`;
}

let toastTimer = 0;
function toast(msg: string, kind: '' | 'good' | 'bad' = '', ms = 1300) {
  fitTopSlot();
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

function banner() {
  $('banner-num').textContent = String(holeIdx + 1);
  $('banner-name').textContent = world.level.name;
  $('banner-par').textContent = `Par ${world.level.par}`;
  fitTopSlot();
  const b = $('banner');
  b.classList.remove('show');
  void b.offsetWidth; // restart the animation
  b.classList.add('show');
}

function show(id: string | null) {
  for (const s of ['screen-title', 'screen-pause', 'screen-hole', 'screen-sheet']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', phase === 'title');
}

/** On the first hole of a player's first round, show a finger pulling back from the ball. */
function updateFinger() {
  const f = $('finger');
  const showIt = !settings.tutorialDone && phase === 'play' && strokes === 0 && !aim.active && !strike && busyTimer <= 0;
  f.classList.toggle('hidden', !showIt);
  if (showIt) {
    const p = view3d.project(world.ball.x, world.ball.y);
    f.style.left = `${p.x}px`;
    f.style.top = `${p.y}px`;
  }
}

// ---------- Flow ----------
function loadHole(i: number) {
  holeIdx = i;
  world = new World(LEVELS[i]);
  recorder.reset();
  view3d.setLevel(world);
  view3d.setMode('play');
  view3d.intro(world);
  strokes = 0;
  lastRest = { x: world.ball.x, y: world.ball.y };
  fx.sink = undefined;
  fx.splash = undefined;
  fx.ripples = [];
  aim.active = false;
  aim.power = 0;
  cue.visible = false;
  strike = null;
  drag = null;
  busyTimer = 0;
  phase = 'play';
  show(null);
  resize();
  updateHud();
  banner();
}

function startRound(ev: CareerEvent | null = null) {
  practice = false;
  careerEvent = ev;
  scores = LEVELS.map(() => null);
  loadHole(0);
  if (ev) toast(`${ev.name} · shoot ${ev.target} or better`, 'good', 2600);
}

function playSingle(i: number) {
  practice = true;
  careerEvent = null;
  scores = LEVELS.map(() => null);
  loadHole(i);
}

function finishHole(score: number, pickedUp = false) {
  scores[holeIdx] = score;
  phase = 'holeDone';
  if (!pickedUp) recordHole(holeIdx, score);
  setRolling(0, false);
  const last = holeIdx === LEVELS.length - 1;
  const par = world.level.par;
  const h = $('hole-result');
  $('hole-kicker').textContent = `HOLE ${holeIdx + 1} · ${world.level.name.toUpperCase()}`;
  h.textContent = pickedUp ? 'Picked up' : resultName(score, par);
  h.className = pickedUp ? 'over' : scoreClass(score, par);
  $('hole-detail').textContent = `${score} stroke${score === 1 ? '' : 's'} on a par ${par}`;
  $('hole-card').innerHTML = scorecardHtml();
  setLabel('btn-next', practice ? 'COURSES' : last && careerEvent ? 'CAREER' : last ? 'PLAY AGAIN' : 'NEXT HOLE');
  if (!pickedUp) sfx.result(score - par, score === 1);
  if (last && !practice) {
    localSet('rounds', String(stat('rounds') + 1));
    const total = scores.reduce<number>((a, b) => a + (b ?? 0), 0);
    const d = roundToPar();
    $('hole-kicker').textContent = 'ROUND COMPLETE';
    h.textContent = `${total} · ${toParLabel(d)}`;
    h.className = d < 0 ? 'under' : d === 0 ? 'par' : 'over';
    $('hole-detail').textContent = `${LEVELS.length} holes, par ${LEVELS.reduce((a, l) => a + l.par, 0)}`;
    const best = Number(localGet(ck('best')) ?? Infinity);
    if (total < best) { localSet(ck('best'), String(total)); $('hole-detail').textContent += ' · New best round!'; }
  }
  // Coins: per hole, a round bonus, and designs unlocked by achievements
  const lines = pickedUp ? [] : holeReward(score, par, sinkBanked);
  const unlocked: string[] = [];
  if (!pickedUp && score === 1) unlocked.push(earn('ace') ?? '');
  if (last && !practice) {
    const d = roundToPar();
    lines.push(...roundReward(d));
    if (d < 0) unlocked.push(earn('underPar') ?? '');
    if (COURSE.id === 'space') unlocked.push(earn('lunar') ?? '');
  }
  if (last && careerEvent) {
    // Career: stars against the event's target, first-clear and new-star coins, and the next tour
    const ev = careerEvent;
    const total = scores.reduce<number>((a, b) => a + (b ?? 0), 0);
    const r = recordEvent(ev, total);
    lines.push(...r.coins);
    if (r.opened) unlocked.push(r.opened.name);
    $('hole-kicker').textContent = `${ev.tier.name} · ${ev.name}`.toUpperCase();
    $('hole-detail').innerHTML = r.stars
      ? `<span class="stars">${starText(r.stars)}</span> Target ${ev.target} · ${r.firstClear ? 'Event cleared!' : 'Cleared'}`
      : `Target ${ev.target} · missed by ${total - ev.target}. Try again!`;
  }
  const earned = lines.reduce((a, [, n]) => a + n, 0);
  addCoins(earned);
  sinkBanked = false;
  $('hole-coins').innerHTML = earned
    ? `<b><i class="coin"></i>+${earned}</b><small>${lines.map(([l, n]) => `${l} +${n}`).join(' · ')}</small>`
      + (unlocked.some(Boolean) ? `<span class="unlocks">${unlocked.filter(Boolean).map((n) => `<span class="unlock">Unlocked: ${n}!</span>`).join('')}</span>` : '')
    : '';
  // Replay: the whole hole, with a hole in one finishing in slow motion
  const ace = recorder.shots.some((x) => x.ace);
  $('btn-watch').classList.toggle('hidden', !recorder.shots.length);
  $('btn-watch').innerHTML = `<svg><use href="#i-play"/></svg>${ace ? 'WATCH YOUR HOLE IN ONE IN SLOW MOTION' : `WATCH REPLAY${recorder.shots.length > 1 ? ` · ${recorder.shots.length} SHOTS` : ''}`}`;
  updateHud();
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
    <tr><th>HOLE</th>${head}<th>TOT</th></tr>
    <tr><th>PAR</th>${par}<td>${parTotal}</td></tr>
    <tr><th>YOU</th>${sc}<td class="total">${total}</td></tr></table>`;
}

function refreshTitle() {
  $('menu-coins').innerHTML = `<i class="coin"></i>${coins()}`;
  const best = localGet(ck('best'));
  $('best').textContent = best ? `${COURSE.name} best round: ${best}` : '';
  setLabel('btn-play', `PLAY ${COURSE.name.toUpperCase()}`);
}

/** Switch course; the menu background moves to its first hole. */
function chooseCourse(id: string) {
  setCourse(id);
  localSet('course', COURSE.id);
  world = new World(LEVELS[0]);
  view3d.setLevel(world);
  refreshTitle();
}

function pause() {
  if (phase !== 'play') return;
  phase = 'paused';
  setRolling(0, false);
  syncSettingsUi();
  show('screen-pause');
}

// ---------- Input ----------
const canAim = () => phase === 'play' && !world.moving && busyTimer <= 0 && !strike;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!canAim() || drag) return;
  // Freeze the view's basis for this drag, so the camera can turn with the aim without
  // feeding back into it.
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, spin: 0, basis: view3d.aimBasis() };
  canvas.setPointerCapture(e.pointerId);
  aim.active = true;
  aim.power = 0;
  $('banner').classList.remove('show'); // get the hole banner out of the way of the shot
  updateHud();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  applyDrag();
});

/** Width of the screen-edge strips that keep the aim turning while the finger rests in them. */
const EDGE_ZONE = 0.12;
const EDGE_TURN = 1.4; // rad/s

/** Turn the current drag into aim direction and power (called on move and every frame). */
function applyDrag() {
  if (!drag) return;
  // Pull back like a cue: dragging down the screen shoots "into" the view.
  const mx = drag.x - drag.sx;
  const my = drag.y - drag.sy;
  const maxDrag = Math.min(window.innerHeight * 0.45, 260);
  const { fwd, right } = drag.basis;
  if (!view3d.isOverview) {
    // Shot camera: down sets power, sideways turns the aim gently (about 23° per 100 px),
    // and holding near a screen edge keeps turning, so the aim can come all the way round
    const yaw = Math.atan2(fwd.y, fwd.x) - mx * AIM_TURN - drag.spin;
    aim.dx = Math.cos(yaw);
    aim.dy = Math.sin(yaw);
    aim.power = Math.min(1, Math.max(0, my) / maxDrag);
  } else {
    // Whole-hole view: the shot goes straight opposite the drag
    const len = Math.hypot(mx, my);
    if (len > 4) {
      const dx = fwd.x * my - right.x * mx;
      const dy = fwd.y * my - right.y * mx;
      const wl = Math.hypot(dx, dy);
      if (wl > 0.01) { aim.dx = dx / wl; aim.dy = dy / wl; }
    }
    aim.power = Math.min(1, len / maxDrag);
  }
  updatePower();
}

function edgeTurn(dt: number) {
  if (!drag || view3d.isOverview) return;
  const w = window.innerWidth;
  const side = drag.x < w * EDGE_ZONE ? -1 : drag.x > w * (1 - EDGE_ZONE) ? 1 : 0;
  if (!side) return;
  drag.spin += side * EDGE_TURN * dt;
  applyDrag();
}

function endDrag(e: PointerEvent, cancel: boolean) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  const p = aim.power;
  aim.active = false;
  aim.power = 0;
  if (!cancel && p > 0.05 && canAim()) {
    // Start the strike animation; the ball is hit when the tip reaches it.
    strike = { t: 0, from: cue.pull, dur: 0.17 - 0.09 * p, p, fired: false };
    cue.ox = world.ball.x;
    cue.oy = world.ball.y;
  } else {
    cue.visible = false;
    view3d.holdAim(); // let go without shooting: keep looking where you turned
  }
  updateHud();
}
canvas.addEventListener('pointerup', (e) => endDrag(e, false));
canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

function fireShot(p: number) {
  lastRest = { x: world.ball.x, y: world.ball.y };
  const speed = MAX_SHOT_SPEED * p * p * 0.35 + MAX_SHOT_SPEED * p * 0.65; // finer control at low power
  world.shoot(cue.dx * speed, cue.dy * speed);
  recorder.start(world, [cue.dx, cue.dy], p);
  strokes++;
  sfx.cue(p);
  buzz(p > 0.7 ? ImpactStyle.Heavy : ImpactStyle.Light);
  view3d.shake(p * 3);
  if (!settings.tutorialDone) { settings.tutorialDone = true; localSet('tutorial', '1'); }
  updateHud();
}

function updateCue(dt: number) {
  if (aim.active) {
    // Aiming: the cue follows the aim and draws back with power, with a slight hand tremor
    cue.visible = aim.power > 0.02;
    cue.dx = aim.dx;
    cue.dy = aim.dy;
    cue.pull = 8 + aim.power * 75 + Math.sin(time * 9) * aim.power * 1.2;
    cue.alpha = 1;
    cue.ox = cue.oy = undefined;
    return;
  }
  if (!strike) return;
  strike.t += dt;
  if (!strike.fired) {
    const k = Math.min(1, strike.t / strike.dur);
    cue.pull = strike.from * (1 - k * k); // accelerate into the ball
    if (k >= 1) { strike.fired = true; strike.t = 0; fireShot(strike.p); }
  } else {
    const follow = 10 + strike.p * 22;
    cue.pull = -follow * Math.min(1, strike.t / 0.1);
    cue.alpha = Math.max(0, 1 - Math.max(0, strike.t - 0.15) / 0.3);
    if (cue.alpha <= 0) { strike = null; cue.visible = false; updateHud(); }
  }
}

// ---------- Buttons ----------
const click = (id: string, fn: () => void) => { $(id).onclick = () => { unlockAudio(); sfx.ui(); fn(); }; };
click('btn-play', () => startRound());
click('btn-pause', pause);
click('btn-resume', () => { phase = 'play'; show(null); });
function toggleView() {
  view3d.setOverview(!view3d.isOverview);
  settings.top = view3d.isOverview;
  localSet('view', settings.top ? 'table' : 'ball');
  syncSettingsUi();
}
function toggleSound() { settings.sound = !settings.sound; setSound(settings.sound); localSet('sound', settings.sound ? '1' : '0'); syncSettingsUi(); }
function toggleGuide() { settings.guide = !settings.guide; aim.guide = settings.guide ? 'full' : 'short'; localSet('guide', settings.guide ? 'full' : 'short'); syncSettingsUi(); }
function toggleArrows() { settings.arrows = !settings.arrows; view3d.setSlopeArrows(settings.arrows); localSet('arrows', settings.arrows ? '1' : '0'); syncSettingsUi(); }
function toggleFollow() { settings.follow = !settings.follow; view3d.follow = settings.follow; localSet('follow', settings.follow ? '1' : '0'); syncSettingsUi(); }
click('btn-view', toggleView);
click('btn-restart', () => { if (phase === 'play') loadHole(holeIdx); });
click('btn-pause-restart', () => loadHole(holeIdx));
click('btn-replay', () => { scores[holeIdx] = null; loadHole(holeIdx); });
click('btn-quit', toTitle);

function toTitle() {
  phase = 'title';
  practice = false;
  setRolling(0, false);
  if (world.level !== LEVELS[0]) { world = new World(LEVELS[0]); view3d.setLevel(world); }
  view3d.setMode('title');
  refreshTitle();
  show('screen-title');
}

// ---------- Main menu sheets ----------
function sheet(title: string, html: string) {
  $('sheet-title').textContent = title;
  $('sheet-body').innerHTML = html;
  show('screen-sheet');
}
click('btn-sheet-close', () => { refreshTitle(); show('screen-title'); });

function openCourses() {
  const sections = COURSES.map((c) => {
    const best = localGet(ck('best', c.id));
    const par = c.holes.reduce((a, l) => a + l.par, 0);
    const cards = c.holes.map((l, i) => {
      const hb = localGet(ck(`hole${i}`, c.id));
      return `<button class="course" data-course="${c.id}" data-hole="${i}"><b>HOLE ${i + 1}</b><span>${l.name}</span><small>Par ${l.par}${hb ? ` · Best ${hb}` : ''}</small></button>`;
    }).join('');
    return `<div class="course-head${c.id === COURSE.id ? ' cur' : ''}"><div><h3>${c.name}</h3><small>${c.holes.length} holes · Par ${par}${best ? ` · Best ${best}` : ''}</small></div>
      <button class="btn-gold small" data-play="${c.id}">PLAY</button></div><div class="courses">${cards}</div>`;
  }).join('');
  sheet('Courses', `<p>Play a full course, or tap any hole to practise it. Practice scores count toward your hole bests, not your round.</p>${sections}`);
  $('sheet-body').querySelectorAll<HTMLButtonElement>('.course').forEach((b) => {
    b.onclick = () => { sfx.ui(); chooseCourse(b.dataset.course!); playSingle(Number(b.dataset.hole)); };
  });
  $('sheet-body').querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) => {
    b.onclick = () => { sfx.ui(); chooseCourse(b.dataset.play!); startRound(); };
  });
}

function openSettings() {
  sheet('Settings', `<div class="settings">
    <button class="toggle" data-set="sound" aria-pressed="${settings.sound}"><span>Sound</span><em></em></button>
    <button class="toggle" data-set="guide" aria-pressed="${settings.guide}"><span>Bank guide (two banks)</span><em></em></button>
    <button class="toggle" data-set="arrows" aria-pressed="${settings.arrows}"><span>Slope arrows</span><em></em></button>
    <button class="toggle" data-set="follow" aria-pressed="${settings.follow}"><span>Camera follows ball</span><em></em></button>
    <button class="toggle" data-set="top" aria-pressed="${settings.top}"><span>Whole-table camera</span><em></em></button></div>`);
  $('sheet-body').querySelectorAll<HTMLButtonElement>('.toggle').forEach((b) => {
    b.onclick = () => {
      sfx.ui();
      const k = b.dataset.set as 'sound' | 'guide' | 'follow' | 'top' | 'arrows';
      if (k === 'sound') toggleSound();
      if (k === 'guide') toggleGuide();
      if (k === 'follow') toggleFollow();
      if (k === 'arrows') toggleArrows();
      if (k === 'top') toggleView();
      b.setAttribute('aria-pressed', String(settings[k]));
    };
  });
}

function openStats() {
  const best = localGet(ck('best'));
  const holes = LEVELS.map((l, i) => `<td>${localGet(ck(`hole${i}`)) ?? '–'}</td>`).join('');
  sheet(`Stats · ${COURSE.name}`, `<div class="stats">
      <div class="stat"><b>${best ?? '–'}</b><span>Best round</span></div>
      <div class="stat"><b>${stat('rounds')}</b><span>Rounds finished</span></div>
      <div class="stat"><b>${stat('aces')}</b><span>Holes in one</span></div>
    </div>
    <div class="card-wrap"><table class="card"><tr><th>HOLE</th>${LEVELS.map((_, i) => `<td>${i + 1}</td>`).join('')}</tr>
    <tr><th>PAR</th>${LEVELS.map((l) => `<td>${l.par}</td>`).join('')}</tr><tr><th>BEST</th>${holes}</tr></table></div>
    <p>Stats are saved on this device only.</p>`);
}

/** Previews are painted once per design, the first time the menu opens. */
const previews = new Map<string, string>();
const preview = (key: string, make: () => string) => previews.get(key) ?? (previews.set(key, make()), previews.get(key)!);

/** Card for one design: equipped, owned, for sale (price), or earned through an achievement. */
function gearCard(k: ItemKey, img: string, equipped: boolean) {
  const { name, price, achievement } = itemInfo(k);
  const state = isOwned(k) ? '' : achievement ? `<em class="lock">🔒 ${achievement}</em>` : `<em class="price"><i class="coin"></i>${price}</em>`;
  return `<button class="gear ${k[0] === 'b' ? 'ball' : 'cue'}${equipped ? ' on' : ''}${isOwned(k) ? '' : ' locked'}" data-item="${k}"><img alt="" src="${img}"><span>${name}</span>${state}</button>`;
}

function openGear() {
  const ballId = localGet('ball') ?? 'cue', cueId = localGet('cue') ?? 'classic';
  const balls = BALLS.map((b) => gearCard(`b:${b.id}`, preview(`b:${b.id}`, () => ballPreview(b.id)), b.id === ballId)).join('');
  const cues = CUES.map((c) => gearCard(`c:${c.id}`, preview(`c:${c.id}`, () => cuePreview(c.id)), c.id === cueId)).join('');
  sheet('Cues & Balls', `<div class="gear-top"><p id="gear-msg">Earn coins on every hole, then unlock new balls and cues. Some can only be won.</p><b class="wallet"><i class="coin"></i><span id="gear-coins">${coins()}</span></b></div>
    <h3 class="gear-head">BALLS</h3><div class="gear-balls">${balls}</div>
    <h3 class="gear-head">CUES</h3><div class="gear-cues">${cues}</div>`);
  const body = $('sheet-body');
  const msg = (t: string, bad = false) => { const m = $('gear-msg'); m.textContent = t; m.classList.toggle('bad', bad); };
  body.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.item as ItemKey;
      const { name, price, achievement } = itemInfo(k);
      if (!isOwned(k)) {
        if (achievement) { sfx.ui(); msg(`${name}: ${achievement.toLowerCase()} to unlock it.`, true); return; }
        // First tap asks, second tap buys
        if (!b.classList.contains('confirm')) {
          sfx.ui();
          if (coins() < price) { msg(`${name} costs ${price} coins. You need ${price - coins()} more.`, true); return; }
          body.querySelectorAll('.confirm').forEach((x) => x.classList.remove('confirm'));
          b.classList.add('confirm');
          msg(`Tap ${name} again to unlock it for ${price} coins.`);
          return;
        }
        if (!buy(k)) return;
        sfx.result(-1, false);
        b.classList.remove('confirm', 'locked');
        b.querySelector('em')?.remove();
        $('gear-coins').textContent = String(coins());
        msg(`Unlocked ${name}!`);
      } else sfx.ui();
      const kind = k[0] === 'b' ? 'ball' : 'cue', id = k.slice(2);
      localSet(kind, id);
      if (kind === 'ball') view3d.setBall(id); else view3d.setCue(id);
      body.querySelectorAll(`[data-item^="${k[0]}:"]`).forEach((x) => x.classList.toggle('on', x === b));
    };
  });
}

// ---------- Career ----------
function openCareer() {
  const tiers = TIERS.map((t, ti) => {
    const evs = EVENTS.filter((e) => e.tier === t);
    const cards = evs.map((ev, i) => {
      const open = isUnlocked(ev), best = bestScore(ev);
      const course = COURSES.find((c) => c.id === ev.course)!.name;
      const note = open ? `Shoot ${ev.target} or better${best != null ? ` · Best ${best}` : ''}` : i ? `Clear ${evs[i - 1].name} first` : 'Locked';
      return `<button class="course event${open ? '' : ' locked'}" data-event="${ev.id}"${open ? '' : ' disabled'}><b>${course.toUpperCase()}</b><span>${ev.name}</span><small>${note}</small><em class="stars">${starText(bestStars(ev))}</em></button>`;
    }).join('');
    const sub = isUnlocked(evs[0])
      ? `Target ${t.toPar > 0 ? `${t.toPar} over par` : t.toPar < 0 ? `${-t.toPar} under par` : 'par'} · ${t.reward} coins per event cleared`
      : `Clear every ${TIERS[ti - 1].name} event to open`;
    return `<div class="course-head"><div><h3>${t.name}</h3><small>${sub}</small></div></div><div class="courses">${cards}</div>`;
  }).join('');
  sheet('Career', `<div class="gear-top"><p>Win events to climb the tours. Beat the target by 2 for a second star and by 4 for a third; every new star pays ${STAR_COINS} coins.</p><b class="wallet"><span class="star">★</span>${totalStars()}/${EVENTS.length * 3}</b></div>${tiers}`);
  $('sheet-body').querySelectorAll<HTMLButtonElement>('[data-event]').forEach((b) => {
    b.onclick = () => {
      const ev = EVENTS.find((e) => e.id === b.dataset.event)!;
      sfx.ui();
      chooseCourse(ev.course);
      startRound(ev);
    };
  });
}

// ---------- Replay ----------
/** Playback of the hole's recorded shots. `pre` is the cue wind-up before each shot, `post` the pause after it. */
let replay: { shots: Shot[]; i: number; clock: number; pre: number; post: number; slow: boolean; speed: number; idx: number; saved: { x: number; y: number; time: number; spin: number[]; sink?: { t: number } } } | null = null;
const PRE = 0.55, SLOW = 0.28;

function startReplay(slow = false) {
  if (!recorder.shots.length) return;
  replay = { shots: recorder.shots, i: 0, clock: 0, pre: 0, post: -1, slow, speed: 1, idx: 0, saved: { x: world.ball.x, y: world.ball.y, time: world.time, spin: world.spinners.map((s) => s.angle), sink: fx.sink } };
  phase = 'replay';
  fx.sink = fx.splash = undefined;
  view3d.setMode('play');
  show(null);
  $('hud').classList.add('replaying');
  $('replay-bar').classList.remove('hidden');
  $('btn-slowmo').classList.toggle('on', slow);
}

function endReplay() {
  if (!replay) return;
  const sv = replay.saved;
  replay = null;
  world.ball.x = sv.x; world.ball.y = sv.y; world.ball.vx = world.ball.vy = 0;
  world.time = sv.time;
  world.spinners.forEach((s, i) => (s.angle = sv.spin[i]));
  world.moving = false;
  cue.visible = false;
  fx.splash = undefined;
  fx.sink = sv.sink; // back to how the hole ended (ball in the cup)
  view3d.setMode(sv.sink ? 'sink' : 'play');
  setRolling(0, false);
  $('hud').classList.remove('replaying');
  $('replay-bar').classList.add('hidden');
  phase = 'holeDone';
  show('screen-hole');
}

function stepReplay(dt: number) {
  const r = replay!;
  const shot = r.shots[r.i];
  $('replay-label').textContent = r.shots.length > 1 ? `Shot ${r.i + 1} of ${r.shots.length}` : shot.ace ? 'Hole in one!' : 'Replay';
  const f0 = shot.frames[0];
  // Wind-up: the cue draws back and strikes, then the ball rolls
  if (r.pre < PRE) {
    r.pre += dt;
    r.speed = 1;
    world.moving = false;
    world.ball.x = f0.x; world.ball.y = f0.y; world.ball.vx = world.ball.vy = 0;
    world.time = f0.t;
    world.spinners.forEach((s, i) => (s.angle = f0.spin[i]));
    view3d.faceYaw(Math.atan2(shot.dir[1], shot.dir[0]));
    const back = 10 + 60 * shot.power;
    const k = Math.min(1, r.pre / (PRE - 0.12));
    Object.assign(cue, { visible: true, alpha: 1, dx: shot.dir[0], dy: shot.dir[1], ox: f0.x, oy: f0.y, pull: r.pre < PRE - 0.12 ? back * Math.sin(k * Math.PI / 2) : back * (1 - (r.pre - (PRE - 0.12)) / 0.12) });
    if (r.pre >= PRE) { cue.visible = false; sfx.cue(shot.power); }
    return;
  }
  if (r.post >= 0) {
    // After the shot: let the sink or splash play out, then move on
    r.post += dt * r.speed;
    if (fx.sink) fx.sink.t += (dt * r.speed) / 0.45;
    if (fx.splash) fx.splash.t += dt * r.speed;
    for (const rp of fx.ripples) rp.t += dt * 1.5;
    if (r.post > (shot.end === 'sink' ? 1.6 : shot.end === 'water' ? 1.1 : 0.6)) {
      r.i++;
      r.pre = 0; r.clock = 0; r.idx = 0; r.post = -1;
      fx.sink = fx.splash = undefined;
      view3d.setMode('play');
      if (r.i >= r.shots.length) endReplay();
    }
    return;
  }
  // Rolling: slow motion near the cup on a hole in one (or all the way when SLO-MO is on)
  const [cx, cy] = world.level.cup;
  const near = Math.hypot(world.ball.x - cx, world.ball.y - cy);
  const goal = r.slow ? SLOW : shot.ace ? SLOW + (1 - SLOW) * Math.max(0, Math.min(1, (near - 80) / 170)) : 1;
  r.speed += (goal - r.speed) * Math.min(1, dt * 4);
  r.clock += dt * r.speed;
  const p = sampleShot(shot, r.clock);
  // Hits between the last frame and this one: sounds and bounces
  for (let j = r.idx + 1; j <= p.i; j++) for (const ev of shot.frames[j].events) {
    if (ev.type === 'wall' || ev.type === 'rail' || ev.type === 'bumper' || ev.type === 'spinner') {
      sfx[ev.type](ev.speed);
      view3d.bounceBall(ev.speed);
    }
  }
  r.idx = p.i;
  world.ball.x = p.x; world.ball.y = p.y; world.ball.vx = p.vx; world.ball.vy = p.vy;
  world.time = p.t;
  world.spinners.forEach((s, i) => (s.angle = p.spin[i]));
  world.moving = !p.done;
  setRolling(Math.hypot(p.vx, p.vy) * r.speed, (world.level.sand ?? []).some((z) => inZone(z, p.x, p.y)));
  if (!p.done) return;
  setRolling(0, false);
  r.post = 0;
  if (shot.end === 'sink') {
    sfx.sink();
    fx.sink = { t: 0 };
    view3d.setMode('sink');
    if (shot.ace) toast('HOLE IN ONE!', 'good', 1800);
  } else if (shot.end === 'water') {
    if (world.level.theme === 'jurassic') sfx.lava(); else if (world.level.theme === 'space') sfx.warp(); else sfx.water();
    fx.splash = { x: p.x, y: p.y, t: 0 };
    fx.ripples.push({ x: p.x, y: p.y, t: 0 }, { x: p.x, y: p.y, t: -0.25 });
    view3d.splash(p.x, p.y);
  }
}

function comingSoon(title: string, icon: string, what: string) {
  sheet(title, `<div class="soon"><svg><use href="#${icon}"/></svg><p>${what}</p><p><b>Not in this prototype yet.</b></p></div>`);
}

click('btn-courses', openCourses);
click('btn-settings', openSettings);
click('btn-stats', openStats);
click('btn-cues', openGear);
click('btn-career', openCareer);
click('btn-watch', () => startReplay());
click('btn-slowmo', () => { if (replay) { replay.slow = !replay.slow; $('btn-slowmo').classList.toggle('on', replay.slow); } });
click('btn-skip', () => endReplay());
click('btn-friends', () => comingSoon('Friends', 'i-friends', 'Challenge friends and compare scorecards.'));
click('btn-shop', () => comingSoon('Shop', 'i-cart', 'Course packs and cosmetics.'));
click('btn-more', () => sheet('How to play', `<p><b>Pull down</b> anywhere to draw the cue back (further for more power) and drag <b>sideways</b> to turn your aim (hold near the screen edge to keep turning), then <b>release</b> to shoot. Let go without pulling down to just turn the view.</p>
  <p>The dotted guide shows your path through the first two banks. It doesn't bend for slopes: the drifting arrows on the turf show which way the ground falls, so aim a little uphill of your target. Water costs a stroke and puts the ball back. Sand slows it down. A hole ends after 10 strokes.</p>
  <p>Every hole earns <b>coins</b>: more for par, birdies, bank shots and holes in one, plus a bonus for finishing a round. Spend them in <b>Cues &amp; Balls</b>; a few designs can only be won.</p>
  <p>The camera sits behind the ball and turns as you aim. Tap <b>TABLE</b> to see the whole hole, and <b>BALL</b> to come back.</p>`));
click('btn-title-sound', () => toggleSound());
click('btn-next', () => {
  if (careerEvent && holeIdx === LEVELS.length - 1) { toTitle(); openCareer(); return; }
  if (practice) { toTitle(); openCourses(); } else if (holeIdx === LEVELS.length - 1) startRound(); else loadHole(holeIdx + 1);
});
click('set-sound', toggleSound);
click('set-guide', toggleGuide);
click('set-follow', toggleFollow);
click('set-arrows', toggleArrows);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
syncSettingsUi();

// ---------- Loop ----------
let prev = performance.now();
function frame(now: number) {
  const dt = Math.min(1 / 30, (now - prev) / 1000);
  prev = now;
  lastFrameDt = dt;
  time += dt;

  if (phase === 'play' || phase === 'title') tick(dt);
  if (phase === 'replay' && replay) stepReplay(dt);
  if (phase === 'play') edgeTurn(dt);
  updateCue(phase === 'play' ? dt : 0);
  updateFinger();
  fadeScoreCard();
  // Slow motion slows the whole scene, not just the ball
  view3d.render(world, aim, cue, fx, time, phase === 'paused' ? 0 : dt * (replay ? replay.speed : 1));
  requestAnimationFrame(frame);
}

/** Hide the score card while a shot is being lined up or played, so it never covers the view. */
let cardFaded = false;
function fadeScoreCard() {
  const fade = phase === 'play' && (aim.active || world.moving || !!strike || busyTimer > 0);
  if (fade === cardFaded) return;
  cardFaded = fade;
  document.querySelector('.hud-card')!.classList.toggle('faded', fade);
}

function tick(dt: number) {
  for (const r of fx.ripples) r.t += dt * 1.5;
  fx.ripples = fx.ripples.filter((r) => r.t < 1);

  if (busyTimer > 0) {
    busyTimer -= dt;
    if (fx.sink) fx.sink.t += dt / 0.45;
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
    world.step(dt); // spinners keep turning during sequences
    setRolling(0, false);
    return;
  }

  if (phase === 'title') { world.step(dt); return; }

  const b = world.ball;
  const events = world.step(dt);
  recorder.frame(world, events, strokes);
  for (const ev of events) {
    switch (ev.type) {
      case 'rail':
        sfx.rail(ev.speed);
        view3d.bounceBall(ev.speed);
        if (ev.speed > 400) buzz(ImpactStyle.Light);
        break;
      case 'wall':
        sfx.wall(ev.speed);
        view3d.bounceBall(ev.speed);
        if (ev.speed > 900) view3d.shake(1.5);
        if (ev.speed > 300) buzz(ImpactStyle.Light);
        break;
      case 'bumper':
        sfx.bumper(ev.speed);
        view3d.bounceBall(ev.speed * 0.8);
        buzz(ImpactStyle.Medium);
        break;
      case 'spinner':
        sfx.spinner(ev.speed);
        view3d.shake(1);
        buzz(ImpactStyle.Medium);
        break;
      case 'lip':
        sfx.lip();
        toast('Lipped out!', 'bad');
        buzz(ImpactStyle.Light);
        break;
      case 'sink': {
        sfx.sink();
        if (native) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        fx.sink = { t: 0 };
        busyTimer = 1.3;
        view3d.setMode('sink');
        const banks = world.contacts;
        sinkBanked = banks > 0;
        const name = resultName(strokes, world.level.par);
        const good = strokes <= world.level.par;
        toast(banks > 0 ? `Bank shot · ${name}` : name, good ? 'good' : '', 1200);
        break;
      }
      case 'water':
        if (world.level.theme === 'jurassic') sfx.lava(); else if (world.level.theme === 'space') sfx.warp(); else sfx.water();
        buzz(ImpactStyle.Heavy);
        fx.splash = { x: b.x, y: b.y, t: 0 };
        fx.ripples.push({ x: b.x, y: b.y, t: 0 }, { x: b.x, y: b.y, t: -0.25 });
        view3d.splash(b.x, b.y);
        strokes++;
        busyTimer = 1.0;
        toast({ jurassic: 'Lava! +1 stroke', space: 'Lost in space! +1 stroke', garden: 'Splash! +1 stroke' }[world.level.theme ?? 'garden'], 'bad');
        updateHud();
        break;
      case 'stop':
        if (strokes >= MAX_STROKES) finishHole(MAX_STROKES, true);
        break;
    }
  }
  const sandy = (world.level.sand ?? []).some((z) => inZone(z, b.x, b.y));
  setRolling(world.moving ? Math.hypot(b.vx, b.vy) : 0, sandy);
}

// Dev-only hook for automated play-testing.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pg = {
    load: loadHole,
    shoot: (angleDeg: number, power: number) => {
      const a = (angleDeg * Math.PI) / 180;
      strokes++;
      world.shoot(Math.cos(a) * MAX_SHOT_SPEED * power, Math.sin(a) * MAX_SHOT_SPEED * power);
      recorder.start(world, [Math.cos(a), Math.sin(a)], power);
    },
    stats: () => view3d.stats,
    view: () => view3d,
    course: (id: string) => chooseCourse(id),
    place: (x: number, y: number) => { world.ball.x = x; world.ball.y = y; },
    cam: (x: number, y: number, dist: number, yaw: number) => view3d.debugView(x, y, dist, yaw),
    aim: () => ({ ...aim }),
    state: () => ({ phase, holeIdx, strokes, ball: { ...world.ball }, moving: world.moving, dt: lastFrameDt }),
  };
}

// Keep the current round when the hosted page receives a live update.
type Hot = { snapshot(fn: () => unknown): void; ready?(fn: (d: unknown) => void): void; data?: unknown };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;
hot?.snapshot(() => ({ holeIdx, scores, playing: phase !== 'title', course: COURSE.id }));

/** Load the 3D models in the background; until then the procedural look stands in. */
function loadCourseModels() {
  const bar = $('loading');
  const fill = bar.querySelector('b') as HTMLElement;
  bar.classList.remove('hidden');
  loadModels((p) => { fill.style.width = `${Math.round(p * 100)}%`; })
    .then(() => {
      view3d.setLevel(world);
      bar.classList.add('hidden');
    })
    .catch((err) => {
      console.warn('Course models failed to load; using the procedural look', err);
      bar.classList.add('hidden');
    });
}

function start(data: unknown) {
  view3d.setLevel(world);
  loadCourseModels();
  refreshTitle();
  resize();
  const d = data as { holeIdx?: number; scores?: (number | null)[]; playing?: boolean; course?: string } | undefined;
  if (d?.course && d.course !== COURSE.id) { setCourse(d.course); world = new World(LEVELS[0]); view3d.setLevel(world); }
  if (d?.playing && typeof d.holeIdx === 'number' && d.holeIdx < LEVELS.length) {
    scores = LEVELS.map((_, i) => d.scores?.[i] ?? null);
    loadHole(d.holeIdx);
  } else {
    view3d.setMode('title');
    show('screen-title');
  }
  requestAnimationFrame(frame);
}
if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
