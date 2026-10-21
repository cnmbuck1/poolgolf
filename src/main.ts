import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { COURSE, COURSES, LevelDef, LEVELS, setCourse } from './levels';
import { inZone, MAX_SHOT_SPEED, routeDistance, shotSpeed, World } from './physics';
import { AimState, CueState, FX, Renderer3D } from './render3d';
import { loadModels } from './models';
import { ballPreview, BALLS, cuePreview, CUES } from './gear';
import { bestScore, bestStars, CareerEvent, EVENTS, isUnlocked, recordEvent, STAR_COINS, starText, TIERS, totalStars } from './career';
import { HoleRecorder, sampleShot, Shot } from './replay';
import { execute, hasMovers, Opponent, OPPONENTS, Planner } from './ai';
import { bestToday, Daily, dailyCourse, dailyFor, dailyName, dateLabel, isDoneToday, recordDaily, streak, today, untilTomorrow } from './daily';
import { checkRule, courseName, isDone, markDone, ruleText, Trick, TRICKS } from './tricks';
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

/** Where the cue will strike the ball (set on the spin pad; resets after each shot). */
const spin = { side: 0, vert: 0 };
const cue: CueState = { visible: false, dx: 1, dy: 0, pull: 0, alpha: 0, spin };
const aim: AimState = { active: false, dx: 1, dy: 0, power: 0, guide: 'full', spin };
const fx: FX = { ripples: [] };
let drag: { id: number; sx: number; sy: number; x: number; y: number; spin: number; basis: ReturnType<Renderer3D['aimBasis']> } | null = null;
let practice = false; // playing a single hole from the Courses menu
let busyTimer = 0; // seconds remaining in a scripted sequence (sinking / splash reset)
let time = 0;
let lastFrameDt = 1 / 60;
let sinkBanked = false; // the ball touched a wall or obstacle on the shot that sank it
const recorder = new HoleRecorder(); // this hole's shots, for the replay
let careerEvent: CareerEvent | null = null; // the Career event being played, if any
let trick: Trick | null = null; // the trick shot being attempted, if any
let attempts = 0; // tries at the current trick shot
let daily: Daily | null = null; // today's daily challenge, while it's being played
/** A match against a computer opponent: both players' scores per hole. */
let match: { opp: Opponent; ai: (number | null)[] } | null = null;
let turn: 'player' | 'ai' = 'player'; // whose turn it is on the hole, in a match
let pendingBanked = false; // the player's sinking shot was a bank shot (paid when the hole result shows)
/** The computer's current shot: planning, then lining up until `fireAt` (world time). */
let aiShot: { planner: Planner; shot?: { deg: number; power: number }; fireAt?: number } | null = null;
let fastAi = false;
/** A closest-to-the-pin shootout settling a halved match: one shot each from the same spot. */
let shootout: { spot: [number, number]; you?: number } | null = null;
let shootoutPending = false; // the match is all square: the next button starts the shootout
let aiBudgetMs = 10; // planning time per frame, so the game keeps animating while the computer thinks
let aiLead = 1.4; // seconds ahead the computer plans for; grows if planning runs late on a slow device
let trickMissed = false; // the ball dropped but broke the trick's rule
let trickReset = 0; // seconds until the ball goes back to the start after a miss

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
  $('hud-hole').textContent = trick ? '★' : String(holeIdx + 1);
  $('hud-par').textContent = String(world.level.par);
  $('hud-strokes').textContent = String(trick ? attempts : strokes);
  $('hud-name').textContent = world.level.name;
  const d = roundToPar();
  const tp = $('hud-topar');
  tp.textContent = toParLabel(d);
  tp.className = `num chip ${d < 0 ? 'under' : d > 0 ? 'over' : ''}`;
  if (trick) { tp.textContent = '–'; $('hud-pips').innerHTML = ''; updatePower(); return; }
  if (match) {
    const up = matchUp();
    tp.textContent = up > 0 ? `${up} UP` : up < 0 ? `${-up} DN` : 'AS';
    tp.className = `num chip ${up > 0 ? 'under' : up < 0 ? 'over' : ''}`;
    if (turn === 'ai') $('hud-name').textContent = `${match.opp.emoji} ${match.opp.name}`;
  }
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
  $('banner-hole').innerHTML = daily ? 'DAILY CHALLENGE' : trick ? 'TRICK SHOT' : `HOLE <b>${holeIdx + 1}</b>`;
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
  shootout = null;
  shootoutPending = false;
  trick = null;
  endAiTurnUi();
  aiShot = null;
  enterLevel(LEVELS[i]);
  banner();
}

/** Start a trick shot in its own little arena. */
function loadTrick(t: Trick) {
  trick = t;
  match = null;
  practice = false;
  careerEvent = null;
  attempts = 0;
  enterLevel(t.level);
  banner();
  toast(ruleText(t), 'good', 3000);
}

/** Put the ball on the tee of a level and reset the shot state. */
function enterLevel(L: LevelDef) {
  world = new World(L);
  recorder.reset();
  setSpin(0, 0);
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
  trickMissed = false;
  trickReset = 0;
  show(null);
  resize();
  updateHud();
}

function startRound(ev: CareerEvent | null = null) {
  practice = false;
  careerEvent = ev;
  daily = null;
  match = null;
  scores = LEVELS.map(() => null);
  loadHole(0);
  if (ev) toast(`${ev.name} · shoot ${ev.target} or better`, 'good', 2600);
}

function playSingle(i: number) {
  practice = true;
  careerEvent = null;
  daily = null;
  match = null;
  scores = LEVELS.map(() => null);
  loadHole(i);
}

/** The ball is in (or the hole is given up): the player's hole, or the computer's in a match. */
function holeOut(score: number, pickedUp = false) {
  if (shootout) shootoutShot(0);
  else if (match && turn === 'ai') finishAiHole(score);
  else if (match) { scores[holeIdx] = score; pendingBanked = sinkBanked; sinkBanked = false; startAiTurn(); }
  else finishHole(score, pickedUp);
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
  setLabel('btn-next', daily ? 'MENU' : practice ? 'COURSES' : last && careerEvent ? 'CAREER' : last ? 'PLAY AGAIN' : 'NEXT HOLE');
  $('btn-replay').textContent = daily ? 'Try again' : 'Replay hole';
  $('btn-replay').classList.remove('hidden');
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
  if (daily?.kind === 'hole') {
    // Daily challenge: meet the day's goal for the daily coins and to keep the streak going
    const d = daily;
    const r = pickedUp ? null : recordDaily(d, score);
    if (r) lines.push(...r.coins);
    $('hole-kicker').textContent = `DAILY CHALLENGE · ${dateLabel(d.day)}`;
    $('hole-card').innerHTML = ''; // a one-hole challenge: no course scorecard
    $('hole-detail').innerHTML = r?.met
      ? `${d.goalName} ✓ · <span class="streak">🔥 ${r.streak}-day streak</span>`
      : `Goal: ${d.goalName.toLowerCase()} (${d.goal} or fewer). Try again!`;
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
  refreshDaily();
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
const canAim = () => phase === 'play' && turn === 'player' && !world.moving && busyTimer <= 0 && trickReset <= 0 && !strike;

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
  if (trick) { attempts++; strokes = 0; recorder.reset(); }
  const speed = shotSpeed(p);
  world.shoot(cue.dx * speed, cue.dy * speed, spin);
  recorder.start(world, [cue.dx, cue.dy], p);
  lastSpin = { ...spin };
  setSpin(0, 0);
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
click('btn-restart', () => { if (phase === 'play') { if (trick) loadTrick(trick); else loadHole(holeIdx); } });
click('btn-pause-restart', () => { if (trick) loadTrick(trick); else loadHole(holeIdx); });
click('btn-replay', () => { if (match) return; if (trick) { loadTrick(trick); return; } scores[holeIdx] = null; loadHole(holeIdx); });
click('btn-quit', toTitle);

function toTitle() {
  phase = 'title';
  endAiTurnUi();
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

// ---------- Spin pad ----------
let lastSpin = { side: 0, vert: 0 }; // spin on the most recent shot (trick shots check it)
function setSpin(side: number, vert: number) {
  const r = Math.hypot(side, vert);
  if (r > 1) { side /= r; vert /= r; }
  spin.side = Math.abs(side) < 0.08 ? 0 : side;
  spin.vert = Math.abs(vert) < 0.08 ? 0 : vert;
  const dot = $('spin-dot');
  dot.style.transform = `translate(${spin.side * 22}px, ${-spin.vert * 22}px)`;
  const on = spin.side !== 0 || spin.vert !== 0;
  $('spin').classList.toggle('on', on);
  $('spin-label').textContent = !on ? 'SPIN' : Math.abs(spin.vert) > Math.abs(spin.side) ? (spin.vert > 0 ? 'TOPSPIN' : 'BACKSPIN') : spin.side > 0 ? 'RIGHT' : 'LEFT';
}
{
  const pad = $('spin-ball');
  let tap: { x: number; y: number; moved: boolean } | null = null;
  const fromEvent = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    setSpin(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  pad.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    unlockAudio();
    pad.setPointerCapture(e.pointerId);
    tap = { x: e.clientX, y: e.clientY, moved: false };
    fromEvent(e);
  });
  pad.addEventListener('pointermove', (e) => {
    if (!tap) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 4) tap.moved = true;
    fromEvent(e);
  });
  pad.addEventListener('pointerup', () => {
    // A tap near the middle clears the spin
    if (tap && !tap.moved && Math.hypot(spin.side, spin.vert) < 0.35) setSpin(0, 0);
    tap = null;
    sfx.ui();
  });
}

// ---------- Against the computer ----------
const vsGet = (k: string) => Number(localGet(`vs.${k}`) ?? 0);
const vsUnlocked = (i: number) => i === 0 || vsGet(`${OPPONENTS[i - 1].id}.wins`) > 0;

/** Holes won minus holes lost so far (the player's match standing). */
function matchUp() {
  if (!match) return 0;
  return scores.reduce<number>((a, s, i) => {
    const c = match!.ai[i];
    return s == null || c == null ? a : a + (s < c ? 1 : s > c ? -1 : 0);
  }, 0);
}

function openVersus() {
  const courseId = localGet('vs.course') ?? COURSE.id;
  const chips = COURSES.map((c) => `<button class="tab${c.id === courseId ? ' on' : ''}" data-vcourse="${c.id}">${c.name.toUpperCase()}</button>`).join('');
  const cards = OPPONENTS.map((o, i) => {
    const open = vsUnlocked(i), w = vsGet(`${o.id}.wins`), l = vsGet(`${o.id}.losses`);
    return `<button class="course opp${open ? '' : ' locked'}" data-opp="${o.id}"${open ? '' : ' disabled'}>
      <span class="avatar" style="background:${o.color}">${o.emoji}</span>
      <span>${o.name}</span><small>${open ? o.blurb : `Beat ${OPPONENTS[i - 1].name} to unlock`}</small>
      <em class="stars">${w || l ? `W ${w} · L ${l}` : `<i class="coin"></i> ${o.reward}`}</em></button>`;
  }).join('');
  sheet('Vs Computer', `<p>Match play: you and your rival play each hole in turn, and the lower score wins the hole. Win the most holes to win the match.</p>
    <div class="tabs">${chips}</div><div class="courses opps">${cards}</div>`);
  const body = $('sheet-body');
  body.querySelectorAll<HTMLButtonElement>('[data-vcourse]').forEach((b) => {
    b.onclick = () => { sfx.ui(); localSet('vs.course', b.dataset.vcourse!); body.querySelectorAll('[data-vcourse]').forEach((x) => x.classList.toggle('on', x === b)); };
  });
  body.querySelectorAll<HTMLButtonElement>('[data-opp]').forEach((b) => {
    b.onclick = () => { sfx.ui(); startMatch(OPPONENTS.find((o) => o.id === b.dataset.opp)!, localGet('vs.course') ?? COURSE.id); };
  });
}

function startMatch(opp: Opponent, courseId: string) {
  chooseCourse(courseId);
  startRound();
  match = { opp, ai: LEVELS.map(() => null) };
  updateHud();
  toast(`${opp.emoji} ${opp.name} · you're up first`, 'good', 2400);
}

/** The player has holed out: the computer plays the same hole from the tee. */
function startAiTurn() {
  turn = 'ai';
  const shots = recorder.shots; // keep the player's shots for the replay
  enterLevel(LEVELS[holeIdx]);
  recorder.shots = shots;
  turn = 'ai';
  aiShot = null;
  $('banner-hole').textContent = `${match!.opp.name.toUpperCase()}'S TURN`;
  const b = $('banner');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  $('hud').classList.add('ai-turn');
  $('ai-bar').classList.remove('hidden');
  $('ai-avatar').textContent = match!.opp.emoji;
  $('ai-avatar').style.background = match!.opp.color;
  updateHud();
}

function endAiTurnUi() {
  turn = 'player';
  view3d.setMarker(null);
  $('hud').classList.remove('ai-turn');
  $('ai-bar').classList.add('hidden');
}

/** Each frame of the computer's turn: plan (a slice at a time), line up the cue, then shoot. */
function stepAi() {
  const m = match!;
  const thinking = !aiShot?.shot;
  $('ai-label').textContent = world.moving || busyTimer > 0 ? m.opp.name : thinking ? `${m.opp.name} is lining up…` : `${m.opp.name} shoots`;
  if (world.moving || busyTimer > 0 || strike) return;
  if (!aiShot) aiShot = { planner: new Planner(world, m.opp, world.time + aiLead, Math.random) };
  if (!aiShot.shot) {
    const plan = aiShot.planner.step(aiBudgetMs);
    if (!plan) return;
    const ex = execute(plan, m.opp, Math.random);
    aiShot.shot = ex;
    if (!hasMovers(world.level)) aiShot.fireAt = world.time + 0.9; // nothing moves: shoot once lined up
    else {
      aiShot.fireAt = aiShot.planner.at + ex.delay;
      // Planning ran past the moment it planned for (a slow device): plan again, further ahead
      if (world.time > aiShot.fireAt) { aiShot = null; aiLead = Math.min(8, aiLead * 1.6); return; }
    }
  }
  const { deg, power } = aiShot.shot!;
  const a = (deg * Math.PI) / 180;
  const left = aiShot.fireAt! - world.time;
  // Line up: face the shot and draw the cue back over the last moment before striking
  view3d.faceYaw(a);
  spin.side = spin.vert = 0;
  Object.assign(cue, { visible: true, alpha: 1, dx: Math.cos(a), dy: Math.sin(a), ox: undefined, oy: undefined, pull: 8 + 70 * power * Math.min(1, Math.max(0, 1 - left / 0.8)) });
  if (left > 0) return;
  cue.visible = false;
  lastRest = { x: world.ball.x, y: world.ball.y };
  const sp = shotSpeed(power);
  world.shoot(Math.cos(a) * sp, Math.sin(a) * sp);
  strokes++;
  sfx.cue(power);
  view3d.shake(power * 2);
  aiShot = null;
  updateHud();
}

/** The computer has holed out: show the hole result for both players. */
function finishAiHole(aiScore: number) {
  const m = match!;
  m.ai[holeIdx] = aiScore;
  turn = 'player';
  aiShot = null;
  cue.visible = false;
  $('hud').classList.remove('ai-turn');
  $('ai-bar').classList.add('hidden');
  phase = 'holeDone';
  setRolling(0, false);
  const you = scores[holeIdx]!, par = world.level.par, last = holeIdx === LEVELS.length - 1;
  recordHole(holeIdx, you);
  const up = matchUp();
  const standing = up > 0 ? `You're ${up} UP` : up < 0 ? `${m.opp.name} is ${-up} UP` : 'All square';
  const h = $('hole-result');
  h.textContent = you < aiScore ? 'You win the hole!' : you > aiScore ? `${m.opp.name} wins the hole` : 'Hole halved';
  h.className = you < aiScore ? 'under' : you > aiScore ? 'over' : 'par';
  $('hole-kicker').textContent = `HOLE ${holeIdx + 1} · VS ${m.opp.name.toUpperCase()}`;
  $('hole-detail').textContent = `You ${you} · ${m.opp.name} ${aiScore} · ${standing}`;
  const lines = holeReward(you, par, pendingBanked);
  const unlocked: string[] = [];
  if (you === 1) unlocked.push(earn('ace') ?? '');
  if (last) {
    // Match over: most holes won takes it; all square goes to a closest-to-the-pin shootout
    const won = scores.filter((s, i) => s! < m.ai[i]!).length, lost = scores.filter((s, i) => s! > m.ai[i]!).length;
    if (won === lost) {
      shootoutPending = true;
      $('hole-kicker').textContent = `ALL SQUARE · VS ${m.opp.name.toUpperCase()}`;
      h.textContent = 'All square!';
      h.className = 'par';
      $('hole-detail').textContent = `Holes won ${won}–${lost}. A closest-to-the-pin shootout decides it.`;
    } else concludeMatch(won > lost, `Holes won ${won}–${lost} · last hole: you ${you}, ${m.opp.name} ${aiScore}`, lines, unlocked);
  }
  const earned = lines.reduce((a, [, n]) => a + n, 0);
  addCoins(earned);
  pendingBanked = false;
  $('hole-coins').innerHTML = `<b><i class="coin"></i>+${earned}</b><small>${lines.map(([l, n]) => `${l} +${n}`).join(' · ')}</small>`
    + (unlocked.some(Boolean) ? `<span class="unlocks">${unlocked.filter(Boolean).map((n) => `<span class="unlock">${n.includes('challenges') ? n : `Unlocked: ${n}`}!</span>`).join('')}</span>` : '');
  // Scorecard: both players
  const row = (label: string, arr: (number | null)[]) => `<tr><th>${label}</th>${LEVELS.map((l, i) => {
    const sc = arr[i], other = arr === scores ? m.ai[i] : scores[i];
    const cls = sc == null || other == null ? '' : sc < other ? 'under' : sc > other ? 'over' : '';
    return `<td class="${cls}">${sc ?? '–'}</td>`;
  }).join('')}<td class="total">${arr.reduce<number>((a, b) => a + (b ?? 0), 0)}</td></tr>`;
  $('hole-card').innerHTML = `<table class="card"><tr><th>HOLE</th>${LEVELS.map((_, i) => `<td class="${i === holeIdx ? 'cur' : ''}">${i + 1}</td>`).join('')}<th>TOT</th></tr>
    <tr><th>PAR</th>${LEVELS.map((l) => `<td>${l.par}</td>`).join('')}<td>${LEVELS.reduce((a, l) => a + l.par, 0)}</td></tr>
    ${row('YOU', scores)}${row(m.opp.emoji, m.ai)}</table>`;
  $('btn-replay').classList.add('hidden');
  $('btn-watch').classList.toggle('hidden', !recorder.shots.length);
  $('btn-watch').innerHTML = '<svg><use href="#i-play"/></svg>WATCH YOUR SHOTS';
  setLabel('btn-next', shootoutPending ? 'SHOOTOUT' : last ? 'OPPONENTS' : 'NEXT HOLE');
  sfx.result(you - aiScore, you === 1);
  updateHud();
  show('screen-hole');
}

/** Record the match result and add its headline, coins and unlocks to the results screen. */
function concludeMatch(win: boolean, detail: string, lines: [string, number][], unlocked: string[]) {
  const m = match!;
  const firstWin = win && vsGet(`${m.opp.id}.wins`) === 0;
  const key = win ? 'wins' : 'losses';
  localSet(`vs.${m.opp.id}.${key}`, String(vsGet(`${m.opp.id}.${key}`) + 1));
  const h = $('hole-result');
  $('hole-kicker').textContent = `MATCH COMPLETE · VS ${m.opp.name.toUpperCase()}`;
  h.textContent = win ? 'You win the match!' : `${m.opp.name} wins`;
  h.className = win ? 'ace' : 'over';
  $('hole-detail').textContent = detail;
  if (win) lines.push([firstWin ? 'Match won' : 'Rematch won', firstWin ? m.opp.reward : Math.round(m.opp.reward / 3)]);
  const next = OPPONENTS[OPPONENTS.indexOf(m.opp) + 1];
  if (firstWin && next) unlocked.push(`${next.name} challenges you`);
}

/** A clear spot about 300 units from the cup with a straight, open line to it (the tee if there's none). */
function shootoutSpot(L: LevelDef): [number, number] {
  const w = new World(L);
  const [cx, cy] = L.cup, toTee = Math.atan2(L.tee[1] - cy, L.tee[0] - cx);
  let best: [number, number] = L.tee, bestScore = Infinity;
  for (const r of [300, 260, 340, 220]) for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    let open = true;
    for (let d = 30; d <= r && open; d += 10) open = Number.isFinite(routeDistance(w, cx + Math.cos(a) * d, cy + Math.sin(a) * d));
    if (!open || (L.sand ?? []).some((z) => inZone(z, x, y)) || (L.quicksand ?? []).some((z) => inZone(z, x, y))) continue;
    // Prefer a line that faces the cup the way the hole is played, and the nearer radius
    const score = Math.abs(Math.atan2(Math.sin(a - toTee), Math.cos(a - toTee))) + Math.abs(r - 300) / 200;
    if (score < bestScore) { bestScore = score; best = [x, y]; }
  }
  return best;
}

function startShootout(again = false) {
  shootoutPending = false;
  const spot = shootout?.spot ?? shootoutSpot(LEVELS[holeIdx]);
  shootout = { spot };
  enterLevel(LEVELS[holeIdx]);
  placeForShootout();
  view3d.setMarker(null);
  $('banner-hole').textContent = again ? 'DEAD HEAT · SHOOT AGAIN' : 'SHOOTOUT';
  const b = $('banner');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  toast('Closest to the pin wins · one shot each', 'good', 2600);
}

/** Put the ball on the shootout spot for the next shot. */
function placeForShootout() {
  const [x, y] = shootout!.spot;
  world.ball.x = x; world.ball.y = y; world.ball.vx = world.ball.vy = 0;
  world.moving = false;
  lastRest = { x, y };
  fx.sink = fx.splash = undefined;
  busyTimer = 0;
  strokes = 0;
  view3d.setMode('play');
}

/** How far from the pin, in pool-ball terms (a ball is about 2¼ inches across). */
function pinDistance(d: number) {
  if (d === 0) return 'in the cup!';
  if (!Number.isFinite(d)) return 'in the hazard';
  const inches = Math.round(Math.max(0, d - CUP_RADIUS) * 0.094);
  return inches < 12 ? `${inches} in` : `${Math.floor(inches / 12)} ft ${inches % 12} in`;
}
const CUP_RADIUS = 21;

/** A shootout shot has finished: `d` is the distance to the cup (0 sunk, Infinity in a hazard). */
function shootoutShot(d: number) {
  const so = shootout!, m = match!;
  if (turn === 'player') {
    so.you = d;
    if (Number.isFinite(d) && d > 0) view3d.setMarker(world.ball.x, world.ball.y);
    toast(`You: ${pinDistance(d)}`, d === 0 ? 'good' : '', 1800);
    startAiTurn();
    placeForShootout();
    $('banner-hole').textContent = `${m.opp.name.toUpperCase()}'S SHOT`;
    return;
  }
  // Both have shot: closest wins; a dead heat goes again
  const you = so.you!;
  if (d === you) { endAiTurnUi(); toast('Dead heat!', 'good', 1600); startShootout(true); return; }
  endAiTurnUi();
  phase = 'holeDone';
  setRolling(0, false);
  const lines: [string, number][] = [], unlocked: string[] = [];
  concludeMatch(you < d, `Closest to the pin: you ${pinDistance(you)}, ${m.opp.name} ${pinDistance(d)}`, lines, unlocked);
  $('hole-kicker').textContent = `SHOOTOUT · VS ${m.opp.name.toUpperCase()}`;
  const earned = lines.reduce((a, [, n]) => a + n, 0);
  addCoins(earned);
  $('hole-coins').innerHTML = earned ? `<b><i class="coin"></i>+${earned}</b><small>${lines.map(([l, n]) => `${l} +${n}`).join(' · ')}</small>`
    + (unlocked.length ? `<span class="unlocks">${unlocked.map((n) => `<span class="unlock">${n}!</span>`).join('')}</span>` : '') : '';
  $('hole-card').innerHTML = '';
  $('btn-replay').classList.add('hidden');
  $('btn-watch').classList.toggle('hidden', !recorder.shots.length);
  $('btn-watch').innerHTML = '<svg><use href="#i-play"/></svg>WATCH YOUR SHOT';
  setLabel('btn-next', 'OPPONENTS');
  sfx.result(you < d ? -1 : 1, false);
  shootout = null;
  updateHud();
  show('screen-hole');
}

// ---------- Daily challenge ----------
function startDaily(day = today()) {
  const d = dailyFor(day);
  if (d.kind === 'hole') {
    chooseCourse(d.course);
    playSingle(d.hole);
    daily = d;
    banner();
    toast(`Daily challenge · ${d.goalName.toLowerCase()}`, 'good', 2600);
  } else {
    loadTrick(d.trick);
    daily = d;
    banner();
  }
}

function refreshDaily() {
  const d = dailyFor(today());
  const done = isDoneToday(d), s = streak();
  $('daily-kicker').textContent = `DAILY CHALLENGE · ${dateLabel(d.day)}`;
  $('daily-name').textContent = dailyName(d);
  const best = bestToday(d);
  $('daily-info').textContent = `${dailyCourse(d)} · ${d.kind === 'hole' ? `${d.goalName}${best != null ? ` · best ${best}` : ''}` : `Trick shot · ${ruleText(d.trick).replace('Sink it in one shot', 'one shot')}`}`;
  $('daily-streak').textContent = s ? `🔥 ${s}` : '';
  $('daily-cta').textContent = done ? `✓ DONE · NEW IN ${untilTomorrow()}` : 'PLAY';
  $('daily-card').classList.toggle('done', done);
}

// ---------- Trick shots ----------
function resetTrickBall() {
  trickReset = 0;
  trickMissed = false;
  fx.sink = fx.splash = undefined;
  busyTimer = 0;
  world.ball.x = world.level.tee[0]; world.ball.y = world.level.tee[1];
  world.ball.vx = world.ball.vy = 0;
  world.moving = false;
  view3d.setMode('play');
  recorder.reset();
  updateHud();
}

function finishTrick() {
  const t = trick!;
  phase = 'holeDone';
  setRolling(0, false);
  const first = markDone(t);
  const lines: [string, number][] = first ? [['Trick shot', t.reward]] : [];
  const r = daily?.kind === 'trick' ? recordDaily(daily, attempts) : null;
  if (r) lines.push(...r.coins);
  const earned = lines.reduce((a, [, n]) => a + n, 0);
  addCoins(earned);
  $('hole-kicker').textContent = daily ? `DAILY CHALLENGE · ${dateLabel(daily.day)}` : `TRICK SHOT · ${t.name.toUpperCase()}`;
  const h = $('hole-result');
  h.textContent = 'Nailed it!';
  h.className = 'ace';
  $('hole-detail').innerHTML = `${ruleText(t)} · ${attempts === 1 ? 'first try!' : `attempt ${attempts}`}${r ? ` · <span class="streak">🔥 ${r.streak}-day streak</span>` : ''}`;
  $('hole-coins').innerHTML = earned
    ? `<b><i class="coin"></i>+${earned}</b><small>${lines.map(([l, n]) => `${l} +${n}`).join(' · ')}</small>`
    : '<small>Already completed · no coins this time</small>';
  $('hole-card').innerHTML = '';
  $('btn-watch').classList.toggle('hidden', !recorder.shots.length);
  $('btn-watch').innerHTML = '<svg><use href="#i-play"/></svg>WATCH IT IN SLOW MOTION';
  $('btn-replay').textContent = 'Try again';
  $('btn-replay').classList.remove('hidden');
  setLabel('btn-next', daily ? 'MENU' : 'TRICK SHOTS');
  sfx.result(-2, true);
  updateHud();
  show('screen-hole');
}

// ---------- Career ----------
function trickCards() {
  return TRICKS.map((t) => `<button class="course event" data-trick="${t.id}"><em class="stars">${isDone(t) ? '✓ DONE' : `<i class="coin"></i> ${t.reward}`}</em><b>${courseName(t).toUpperCase()}</b><span>${t.name}</span><small>${ruleText(t)}</small></button>`).join('');
}

function openCareer(tab: 'tours' | 'tricks' = 'tours') {
  if (tab === 'tricks') {
    const done = TRICKS.filter(isDone).length;
    sheet('Career', `<div class="tabs"><button class="tab" data-tab="tours">TOURS</button><button class="tab on">TRICK SHOTS</button></div>
      <div class="gear-top"><p>One shot each. Banks, swerves, draws and timing: use the spin pad by the power bar to strike the ball off-centre.</p><b class="wallet">${done}/${TRICKS.length}</b></div>
      <div class="courses">${trickCards()}</div>`);
    $('sheet-body').querySelectorAll<HTMLButtonElement>('[data-trick]').forEach((b) => {
      b.onclick = () => { sfx.ui(); daily = null; loadTrick(TRICKS.find((t) => t.id === b.dataset.trick)!); };
    });
    $('sheet-body').querySelector<HTMLButtonElement>('[data-tab="tours"]')!.onclick = () => { sfx.ui(); openCareer('tours'); };
    return;
  }
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
  sheet('Career', `<div class="tabs"><button class="tab on">TOURS</button><button class="tab" data-tab="tricks">TRICK SHOTS</button></div><div class="gear-top"><p>Win events to climb the tours. Beat the target by 2 for a second star and by 4 for a third; every new star pays ${STAR_COINS} coins.</p><b class="wallet"><span class="star">★</span>${totalStars()}/${EVENTS.length * 3}</b></div>${tiers}`);
  $('sheet-body').querySelectorAll<HTMLButtonElement>('[data-event]').forEach((b) => {
    b.onclick = () => {
      const ev = EVENTS.find((e) => e.id === b.dataset.event)!;
      sfx.ui();
      chooseCourse(ev.course);
      startRound(ev);
    };
  });
  $('sheet-body').querySelector<HTMLButtonElement>('[data-tab="tricks"]')!.onclick = () => { sfx.ui(); openCareer('tricks'); };
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
  $('replay-label').textContent = r.shots.length > 1 ? `Shot ${r.i + 1} of ${r.shots.length}` : trick ? trick.name : shot.ace ? 'Hole in one!' : 'Replay';
  const f0 = shot.frames[0];
  // Wind-up: the cue draws back and strikes, then the ball rolls
  if (r.pre < PRE) {
    r.pre += dt;
    r.speed = 1;
    world.moving = false;
    world.ball.x = f0.x; world.ball.y = f0.y; world.ball.vx = world.ball.vy = 0;
    world.time = f0.t;
    world.spinners.forEach((s, i) => (s.angle = f0.arms[i]));
    view3d.faceYaw(Math.atan2(shot.dir[1], shot.dir[0]));
    const back = 10 + 60 * shot.power;
    const k = Math.min(1, r.pre / (PRE - 0.12));
    Object.assign(spin, shot.spin);
    Object.assign(cue, { visible: true, alpha: 1, dx: shot.dir[0], dy: shot.dir[1], ox: f0.x, oy: f0.y, pull: r.pre < PRE - 0.12 ? back * Math.sin(k * Math.PI / 2) : back * (1 - (r.pre - (PRE - 0.12)) / 0.12) });
    if (r.pre >= PRE) { cue.visible = false; sfx.cue(shot.power); spin.side = spin.vert = 0; }
    return;
  }
  if (r.post >= 0) {
    // After the shot: let the sink or splash play out, then move on
    r.post += dt * r.speed;
    if (fx.sink) fx.sink.t += (dt * r.speed) / 0.45;
    if (fx.splash) fx.splash.t += dt * r.speed;
    for (const rp of fx.ripples) rp.t += dt * 1.5;
    if (r.post > (shot.end === 'sink' ? 1.6 : shot.end === 'water' || shot.end === 'oob' || shot.end === 'quicksand' ? 1.1 : 0.6)) {
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
    } else if (ev.type === 'launch') (ev.by === 'cannon' ? sfx.cannon : sfx.boing)();
    else if (ev.type === 'teleport') sfx.portal();
    else if (ev.type === 'land') sfx.land();
  }
  r.idx = p.i;
  world.ball.x = p.x; world.ball.y = p.y; world.ball.vx = p.vx; world.ball.vy = p.vy; world.ball.z = p.z;
  world.time = p.t;
  world.spinners.forEach((s, i) => (s.angle = p.arms[i]));
  world.moving = !p.done;
  setRolling(Math.hypot(p.vx, p.vy) * r.speed, (world.level.sand ?? []).some((z) => inZone(z, p.x, p.y)));
  if (!p.done) return;
  setRolling(0, false);
  r.post = 0;
  if (shot.end === 'sink') {
    sfx.sink();
    fx.sink = { t: 0 };
    view3d.setMode('sink');
    if (shot.ace) toast(trick ? 'TRICK SHOT!' : 'HOLE IN ONE!', 'good', 1800);
  } else if (shot.end === 'quicksand') {
    sfx.quicksand();
    fx.splash = { x: p.x, y: p.y, t: 0 };
  } else if (shot.end === 'oob') {
    sfx.whistle();
    fx.splash = { x: p.x, y: p.y, t: 0 };
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
click('btn-career', () => openCareer());
click('btn-versus', openVersus);
click('btn-fast', () => { fastAi = !fastAi; $('btn-fast').classList.toggle('on', fastAi); });
click('daily-card', () => startDaily());
click('btn-watch', () => startReplay());
click('btn-slowmo', () => { if (replay) { replay.slow = !replay.slow; $('btn-slowmo').classList.toggle('on', replay.slow); } });
click('btn-skip', () => endReplay());
click('btn-friends', () => comingSoon('Friends', 'i-friends', 'Challenge friends and compare scorecards.'));
click('btn-shop', () => comingSoon('Shop', 'i-cart', 'Course packs and cosmetics.'));
click('btn-more', () => sheet('How to play', `<p><b>Pull down</b> anywhere to draw the cue back (further for more power) and drag <b>sideways</b> to turn your aim (hold near the screen edge to keep turning), then <b>release</b> to shoot. Let go without pulling down to just turn the view.</p>
  <p>The dotted guide shows your path through the first two banks. It doesn't bend for slopes: the drifting arrows on the turf show which way the ground falls, so aim a little uphill of your target. Water costs a stroke and puts the ball back. Sand slows it down. A hole ends after 10 strokes.</p>
  <p><b>Spin:</b> drag the red dot on the cue-ball pad (above the power bar) to strike off-centre. Left or right swerves the ball and kicks it off walls; top spin rolls on further, backspin bites and pulls back off a wall. Tap the middle to clear it.</p>
  <p>In the <b>Big Top Circus</b>, trampolines bounce the ball over anything in its way (faster in, further out) and cannons fire it across the tent the way the barrel points. Land outside the ring and it's <b>out of bounds</b>: +1 stroke and back to where you hit from.</p>
  <p>In <b>Pharaoh's Tomb</b>, roll into a teal scarab portal to come out of its violet partner; stone doors rise and sink on a timer; and quicksand grips the ball and drags it in: stop in it and it's swallowed (+1 stroke).</p>
  <p><b>Vs Computer</b> is match play: you play each hole, then your rival does, and the lower score wins the hole. Beat each rival to unlock the next. All square after six holes? A closest-to-the-pin shootout settles it: one shot each, nearest the cup wins.</p>
  <p>A new <b>daily challenge</b> appears on the main menu every day: a hole with a goal (par or birdie) or a trick shot. Complete it for bonus coins and keep your 🔥 streak going.</p>
  <p>Every hole earns <b>coins</b>: more for par, birdies, bank shots and holes in one, plus a bonus for finishing a round. Spend them in <b>Cues &amp; Balls</b>; a few designs can only be won.</p>
  <p>The camera sits behind the ball and turns as you aim. Tap <b>TABLE</b> to see the whole hole, and <b>BALL</b> to come back.</p>`));
click('btn-title-sound', () => toggleSound());
click('btn-next', () => {
  if (match) {
    if (shootoutPending) { startShootout(); return; }
    if (holeIdx === LEVELS.length - 1) { match = null; toTitle(); openVersus(); } else loadHole(holeIdx + 1);
    return;
  }
  if (daily) { daily = null; toTitle(); return; }
  if (trick) { toTitle(); openCareer('tricks'); return; }
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
  if (phase === 'play' && match && turn === 'ai') {
    stepAi();
    // FAST plays the computer's turn at triple speed
    if (fastAi) for (let k = 0; k < 2 && phase === 'play' && turn === 'ai'; k++) { tick(dt); stepAi(); }
  }
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
  $('spin').classList.toggle('busy', phase === 'play' && (world.moving || !!strike || busyTimer > 0));
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
      if (fx.sink && trick) { if (trickMissed) resetTrickBall(); else finishTrick(); }
      else if (fx.sink) holeOut(strokes);
      else if (fx.splash) {
        fx.splash = undefined;
        world.ball.x = lastRest.x;
        world.ball.y = lastRest.y;
        if (shootout) shootoutShot(Infinity);
        else if (strokes >= MAX_STROKES) holeOut(MAX_STROKES, true);
      }
    }
    world.step(dt); // spinners keep turning during sequences
    setRolling(0, false);
    return;
  }

  if (phase === 'title') { world.step(dt); return; }
  if (trickReset > 0) { trickReset -= dt; if (trickReset <= 0) resetTrickBall(); }

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
        if (trick) {
          // It dropped, but did it follow the trick's rule?
          const why = checkRule(trick, world.contacts, lastSpin);
          trickMissed = !!why;
          if (why) { sfx.lip(); fx.sink = { t: 0 }; busyTimer = 1.3; toast(why, 'bad', 2600); break; }
        }
        sfx.sink();
        if (native) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        fx.sink = { t: 0 };
        busyTimer = 1.3;
        view3d.setMode('sink');
        const banks = world.contacts;
        const name = resultName(strokes, world.level.par);
        const good = strokes <= world.level.par;
        if (turn === 'ai' && match) { toast(`${match.opp.emoji} ${name}`, good ? 'bad' : 'good', 1200); break; }
        sinkBanked = banks > 0;
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
        toast({ jurassic: 'Lava! +1 stroke', space: 'Lost in space! +1 stroke', garden: 'Splash! +1 stroke', circus: 'Splash! +1 stroke', tomb: 'Splash! +1 stroke' }[world.level.theme ?? 'garden'], 'bad');
        updateHud();
        break;
      case 'launch':
        if (ev.by === 'cannon') { sfx.cannon(); view3d.shake(4); buzz(ImpactStyle.Heavy); toast('BOOM!', 'good', 700); }
        else { sfx.boing(); buzz(ImpactStyle.Medium); toast('Boing!', 'good', 600); }
        break;
      case 'land':
        sfx.land();
        view3d.bounceBall(700);
        break;
      case 'teleport':
        sfx.portal();
        buzz(ImpactStyle.Light);
        break;
      case 'quicksand':
        // Came to rest in quicksand: swallowed, a stroke, back to where it was hit from
        sfx.quicksand();
        buzz(ImpactStyle.Heavy);
        fx.splash = { x: b.x, y: b.y, t: 0 };
        strokes++;
        busyTimer = 1.1;
        toast('Swallowed by quicksand! +1 stroke', 'bad');
        updateHud();
        break;
      case 'oob':
        // Bounced right out of the ring: a stroke, and back to where it was hit from
        sfx.whistle();
        buzz(ImpactStyle.Heavy);
        fx.splash = { x: b.x, y: b.y, t: 0 };
        strokes++;
        busyTimer = 1.0;
        toast('Out of bounds! +1 stroke', 'bad');
        updateHud();
        break;
      case 'stop':
        if (shootout) { shootoutShot(Math.hypot(b.x - world.level.cup[0], b.y - world.level.cup[1])); break; }
        if (trick) { toast('Missed! Try again', 'bad', 1100); trickReset = 0.9; break; }
        if (strokes >= MAX_STROKES) holeOut(MAX_STROKES, true);
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
    /** Fire through the real shot path (aim angle in degrees, power 0..1, spin). */
    fire: (deg: number, p: number, side = 0, vert = 0) => {
      const a = (deg * Math.PI) / 180;
      cue.dx = Math.cos(a); cue.dy = Math.sin(a);
      setSpin(side, vert);
      fireShot(p);
    },
    trick: (id: string) => loadTrick(TRICKS.find((t) => t.id === id)!),
    daily: (offset = 0) => startDaily(today() + offset),
    aiBudget: (ms: number) => { aiBudgetMs = ms; },
    shootout: (id: string, course: string) => { startMatch(OPPONENTS.find((o) => o.id === id)!, course); loadHole(LEVELS.length - 1); startShootout(); },
    versus: (id: string, course: string) => startMatch(OPPONENTS.find((o) => o.id === id)!, course),
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
