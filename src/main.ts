import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { LEVELS } from './levels';
import { inZone, MAX_SHOT_SPEED, World } from './physics';
import { AimState, CueState, FX, Renderer3D } from './render3d';
import { loadModels } from './models';
import { setRolling, setSound, sfx, unlockAudio } from './audio';

const MAX_STROKES = 10;
const native = Capacitor.isNativePlatform();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const view3d = new Renderer3D(canvas);

type Phase = 'title' | 'play' | 'paused' | 'holeDone';

let phase: Phase = 'title';
let holeIdx = 0;
let world = new World(LEVELS[0]);
let strokes = 0;
let scores: (number | null)[] = LEVELS.map(() => null);
let lastRest = { x: 0, y: 0 };
const aim: AimState = { active: false, dx: 1, dy: 0, power: 0, guide: 'full' };
const cue: CueState = { visible: false, dx: 1, dy: 0, pull: 0, alpha: 0 };
const fx: FX = { ripples: [] };
let drag: { id: number; sx: number; sy: number; basis: ReturnType<Renderer3D['aimBasis']> } | null = null;
let practice = false; // playing a single hole from the Courses menu
let busyTimer = 0; // seconds remaining in a scripted sequence (sinking / splash reset)
let time = 0;
let lastFrameDt = 1 / 60;

/** Cue strike: the cue slides into the ball, the shot fires on contact, then it follows through and fades. */
let strike: { t: number; from: number; dur: number; p: number; fired: boolean } | null = null;

// ---------- Settings ----------
function localGet(k: string) { try { return localStorage.getItem(`poolgolf.${k}`); } catch { return null; } }
function localSet(k: string, v: string) { try { localStorage.setItem(`poolgolf.${k}`, v); } catch { /* ignore */ } }

const settings = {
  sound: localGet('sound') !== '0',
  guide: localGet('guide') !== 'short',
  follow: localGet('follow') !== '0',
  top: localGet('view') === 'table', // whole-table view instead of the shot camera
  tutorialDone: localGet('tutorial') === '1',
};
setSound(settings.sound);
aim.guide = settings.guide ? 'full' : 'short';
view3d.follow = settings.follow;
view3d.setOverview(settings.top);

function syncSettingsUi() {
  $('set-sound').setAttribute('aria-pressed', String(settings.sound));
  $('set-guide').setAttribute('aria-pressed', String(settings.guide));
  $('set-follow').setAttribute('aria-pressed', String(settings.follow));
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
function recordHole(i: number, score: number) {
  const best = localGet(`hole${i}`);
  if (best == null || score < Number(best)) localSet(`hole${i}`, String(score));
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

let toastTimer = 0;
function toast(msg: string, kind: '' | 'good' | 'bad' = '', ms = 1300) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

function banner() {
  $('banner-num').textContent = String(holeIdx + 1);
  $('banner-name').textContent = world.level.name;
  $('banner-par').textContent = `Par ${world.level.par} · ${LEVELS.length} holes`;
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

function startRound() {
  practice = false;
  scores = LEVELS.map(() => null);
  loadHole(0);
}

function playSingle(i: number) {
  practice = true;
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
  setLabel('btn-next', practice ? 'COURSES' : last ? 'PLAY AGAIN' : 'NEXT HOLE');
  if (!pickedUp) sfx.result(score - par, score === 1);
  if (last && !practice) {
    localSet('rounds', String(stat('rounds') + 1));
    const total = scores.reduce<number>((a, b) => a + (b ?? 0), 0);
    const d = roundToPar();
    $('hole-kicker').textContent = 'ROUND COMPLETE';
    h.textContent = `${total} · ${toParLabel(d)}`;
    h.className = d < 0 ? 'under' : d === 0 ? 'par' : 'over';
    $('hole-detail').textContent = `${LEVELS.length} holes, par ${LEVELS.reduce((a, l) => a + l.par, 0)}`;
    const best = Number(localGet('best') ?? Infinity);
    if (total < best) { localSet('best', String(total)); $('hole-detail').textContent += ' · New best round!'; }
  }
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
  const best = localGet('best');
  $('best').textContent = best ? `Best round: ${best}` : '';
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
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, basis: view3d.aimBasis() };
  canvas.setPointerCapture(e.pointerId);
  aim.active = true;
  aim.power = 0;
  updateHud();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  // Pull back like a cue: the shot goes opposite to the drag. Dragging down the screen
  // shoots "into" the view; sideways turns the aim. Power is how far the finger moved.
  const mx = e.clientX - drag.sx;
  const my = e.clientY - drag.sy;
  const len = Math.hypot(mx, my);
  const maxDrag = Math.min(window.innerHeight * 0.45, 260);
  if (len > 4) {
    const { fwd, right } = drag.basis;
    const dx = fwd.x * my - right.x * mx;
    const dy = fwd.y * my - right.y * mx;
    const wl = Math.hypot(dx, dy);
    if (wl > 0.01) { aim.dx = dx / wl; aim.dy = dy / wl; }
  }
  aim.power = Math.min(1, len / maxDrag);
  updatePower();
});

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
  }
  updateHud();
}
canvas.addEventListener('pointerup', (e) => endDrag(e, false));
canvas.addEventListener('pointercancel', (e) => endDrag(e, true));

function fireShot(p: number) {
  lastRest = { x: world.ball.x, y: world.ball.y };
  const speed = MAX_SHOT_SPEED * p * p * 0.35 + MAX_SHOT_SPEED * p * 0.65; // finer control at low power
  world.shoot(cue.dx * speed, cue.dy * speed);
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
click('btn-play', startRound);
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
click('btn-sheet-close', () => show('screen-title'));

function openCourses() {
  const cards = LEVELS.map((l, i) => {
    const best = localGet(`hole${i}`);
    return `<button class="course" data-hole="${i}"><b>HOLE ${i + 1}</b><span>${l.name}</span><small>Par ${l.par}${best ? ` · Best ${best}` : ''}</small>${l.art === 'premium' ? '<em class="tag">New look</em>' : ''}</button>`;
  }).join('');
  sheet('Courses', `<p>Practise any hole on its own. Scores here count toward your hole bests, not your round.</p><div class="courses">${cards}</div>`);
  $('sheet-body').querySelectorAll<HTMLButtonElement>('.course').forEach((b) => {
    b.onclick = () => { sfx.ui(); playSingle(Number(b.dataset.hole)); };
  });
}

function openSettings() {
  sheet('Settings', `<div class="settings">
    <button class="toggle" data-set="sound" aria-pressed="${settings.sound}"><span>Sound</span><em></em></button>
    <button class="toggle" data-set="guide" aria-pressed="${settings.guide}"><span>Bank guide (two banks)</span><em></em></button>
    <button class="toggle" data-set="follow" aria-pressed="${settings.follow}"><span>Camera follows ball</span><em></em></button>
    <button class="toggle" data-set="top" aria-pressed="${settings.top}"><span>Whole-table camera</span><em></em></button></div>`);
  $('sheet-body').querySelectorAll<HTMLButtonElement>('.toggle').forEach((b) => {
    b.onclick = () => {
      sfx.ui();
      const k = b.dataset.set as 'sound' | 'guide' | 'follow' | 'top';
      if (k === 'sound') toggleSound();
      if (k === 'guide') toggleGuide();
      if (k === 'follow') toggleFollow();
      if (k === 'top') toggleView();
      b.setAttribute('aria-pressed', String(settings[k]));
    };
  });
}

function openStats() {
  const best = localGet('best');
  const holes = LEVELS.map((l, i) => `<td>${localGet(`hole${i}`) ?? '–'}</td>`).join('');
  sheet('Stats', `<div class="stats">
      <div class="stat"><b>${best ?? '–'}</b><span>Best round</span></div>
      <div class="stat"><b>${stat('rounds')}</b><span>Rounds finished</span></div>
      <div class="stat"><b>${stat('aces')}</b><span>Holes in one</span></div>
    </div>
    <div class="card-wrap"><table class="card"><tr><th>HOLE</th>${LEVELS.map((_, i) => `<td>${i + 1}</td>`).join('')}</tr>
    <tr><th>PAR</th>${LEVELS.map((l) => `<td>${l.par}</td>`).join('')}</tr><tr><th>BEST</th>${holes}</tr></table></div>
    <p>Stats are saved on this device only.</p>`);
}

function comingSoon(title: string, icon: string, what: string) {
  sheet(title, `<div class="soon"><svg><use href="#${icon}"/></svg><p>${what}</p><p><b>Not in this prototype yet.</b></p></div>`);
}

click('btn-courses', openCourses);
click('btn-settings', openSettings);
click('btn-stats', openStats);
click('btn-cues', () => comingSoon('Cues & Balls', 'i-cue', 'Unlock new cues and ball designs.'));
click('btn-achievements', () => comingSoon('Achievements', 'i-trophy', 'Earn trophies for bank shots, aces and clean rounds.'));
click('btn-friends', () => comingSoon('Friends', 'i-friends', 'Challenge friends and compare scorecards.'));
click('btn-shop', () => comingSoon('Shop', 'i-cart', 'Course packs and cosmetics.'));
click('btn-more', () => sheet('How to play', `<p><b>Pull back</b> anywhere on the table to aim the cue, then <b>release</b> to shoot. Pull further for more power.</p>
  <p>The dotted guide shows your path through the first two banks. Water costs a stroke and puts the ball back. Sand slows it down. A hole ends after 10 strokes.</p>
  <p>The camera sits behind the ball and turns as you aim. Tap <b>TABLE</b> to see the whole hole, and <b>BALL</b> to come back.</p>`));
click('btn-title-sound', () => toggleSound());
click('btn-next', () => {
  if (practice) { toTitle(); openCourses(); } else if (holeIdx === LEVELS.length - 1) startRound(); else loadHole(holeIdx + 1);
});
click('set-sound', toggleSound);
click('set-guide', toggleGuide);
click('set-follow', toggleFollow);
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
  updateCue(phase === 'play' ? dt : 0);
  updateFinger();
  view3d.render(world, aim, cue, fx, time, phase === 'paused' ? 0 : dt);
  requestAnimationFrame(frame);
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
  for (const ev of world.step(dt)) {
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
        const name = resultName(strokes, world.level.par);
        const good = strokes <= world.level.par;
        toast(banks > 0 ? `Bank shot · ${name}` : name, good ? 'good' : '', 1200);
        break;
      }
      case 'water':
        sfx.water();
        buzz(ImpactStyle.Heavy);
        fx.splash = { x: b.x, y: b.y, t: 0 };
        fx.ripples.push({ x: b.x, y: b.y, t: 0 }, { x: b.x, y: b.y, t: -0.25 });
        view3d.splash(b.x, b.y);
        strokes++;
        busyTimer = 1.0;
        toast('Splash! +1 stroke', 'bad');
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
    },
    stats: () => view3d.stats,
    place: (x: number, y: number) => { world.ball.x = x; world.ball.y = y; },
    cam: (x: number, y: number, dist: number, yaw: number) => view3d.debugView(x, y, dist, yaw),
    state: () => ({ phase, holeIdx, strokes, ball: { ...world.ball }, moving: world.moving, dt: lastFrameDt }),
  };
}

// Keep the current round when the hosted page receives a live update.
type Hot = { snapshot(fn: () => unknown): void; ready?(fn: (d: unknown) => void): void; data?: unknown };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;
hot?.snapshot(() => ({ holeIdx, scores, playing: phase !== 'title' }));

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
  const d = data as { holeIdx?: number; scores?: (number | null)[]; playing?: boolean } | undefined;
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
