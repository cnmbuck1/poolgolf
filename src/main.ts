import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { COURSE, COURSES, LevelDef, LEVELS, setCourse } from './levels';
import { alienAt, astronautAt, BALL_R, dinoPose, inZone, MAX_SHOT_SPEED, routeDistance, shotSpeed, World } from './physics';
import { AimState, CueState, FX, Renderer3D } from './render3d';
import { loadModels } from './models';
import { ballPreview, BALLS, cuePreview, CUES } from './gear';
import { bestScore, bestStars, CareerEvent, EVENTS, isUnlocked, recordEvent, STAR_COINS, starText, TIERS, totalStars } from './career';
import { HoleRecorder, sampleShot, Shot } from './replay';
import { execute, hasMovers, Opponent, OPPONENTS, Planner } from './ai';
import { bestToday, Daily, dailyCourse, dailyFor, dailyName, dateLabel, isDoneToday, recordDaily, streak, today, untilTomorrow } from './daily';
import { checkRule, courseName, isDone, markDone, ruleText, Trick, TRICKS } from './tricks';
import { ACHIEVEMENTS, addCoins, buy, coins, earn, holeReward, isOwned, itemInfo, ItemKey, roundReward } from './wallet';
import { setMusic, setRolling, setSound, sfx, unlockAudio } from './audio';
import { playMusic } from './music';
import { PLAYTEST_URL, TESTER_CODE_HASH } from './playtest.config';
import { sha256 } from './sha256';
import { tipsFor } from './tips';
import { DEMO_LEVEL, DEMO_SHOT } from './demo';
import * as P from './progress';
import { BUILD, flush, loadRecords, PlaytestRecord, setTesterName, summarize, testerName, track } from './telemetry';

const MAX_STROKES = 10;
/** Aim turn per pixel of sideways drag on the shot camera (radians). */
const AIM_TURN = 0.004;
const native = Capacitor.isNativePlatform();
/**
 * Whether this device can vibrate here: always in the app (native haptics); on the web only where the
 * Vibration API exists and the page isn't embedded in another site (browsers block it in embedded frames).
 */
const canVibrate = native || ('vibrate' in navigator && (() => { try { return window.top === window.self || window.top!.location.origin === location.origin; } catch { return false; } })());

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const view3d = new Renderer3D(canvas);

type Phase = 'title' | 'play' | 'paused' | 'holeDone' | 'replay';

let phase: Phase = 'title';
let holeIdx = 0;
let holeStartedAt = 0; // for playtest records: how long each hole took
/** The last hole the player finished, so feedback sent from the main menu afterwards is tied to it. */
let lastPlayed: { course: string; hole: number; name: string; strokes: number } | null = null;
setCourse(localGet('course') ?? 'candy');
let world = new World(LEVELS[0]);
let strokes = 0;
let scores: (number | null)[] = LEVELS.map(() => null);
let lastRest = { x: 0, y: 0 };

/** Where the cue will strike the ball (set on the spin pad; resets after each shot). */
const spin = { side: 0, vert: 0 };
const cue: CueState = { visible: false, dx: 1, dy: 0, pull: 0, alpha: 0, spin };
const aim: AimState = { active: false, dx: 1, dy: 0, power: 0, guide: 'full', spin };
const fx: FX = { ripples: [] };
let drag: { id: number; sx: number; sy: number; x: number; y: number; yaw: number; pulled: boolean; basis: ReturnType<Renderer3D['aimBasis']> } | null = null;
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
  music: localGet('music') !== '0',
  vibrate: localGet('vibrate') !== '0',
  guide: localGet('guide') !== 'short',
  follow: localGet('follow') !== '0',
  arrows: localGet('arrows') !== '0',
  top: localGet('view') === 'table', // whole-table view instead of the shot camera
  tutorialDone: localGet('tutorial') === '1',
};
setSound(settings.sound);
setMusic(settings.music);
aim.guide = settings.guide ? 'full' : 'short';
view3d.follow = settings.follow;
view3d.setSlopeArrows(settings.arrows);
view3d.setOverview(settings.top);
view3d.setBall(localGet('ball') ?? 'cue');
view3d.setCue(localGet('cue') ?? 'classic');

function syncSettingsUi() {
  $('set-sound').setAttribute('aria-pressed', String(settings.sound));
  $('set-music').setAttribute('aria-pressed', String(settings.music));
  $('set-vibrate').setAttribute('aria-pressed', String(settings.vibrate));
  $('set-guide').setAttribute('aria-pressed', String(settings.guide));
  $('set-follow').setAttribute('aria-pressed', String(settings.follow));
  $('set-arrows').setAttribute('aria-pressed', String(settings.arrows));
  $('view-label').textContent = view3d.isOverview ? 'BALL' : 'TABLE';
  $('btn-turn').style.display = view3d.isOverview ? 'none' : '';
  // The speaker on the title screen mutes everything: it shows muted only when sound and music are both off
  const t = $('btn-title-sound'), on = settings.sound || settings.music;
  t.querySelector('use')!.setAttribute('href', on ? '#i-sound' : '#i-mute');
  t.setAttribute('aria-label', on ? 'Mute sound and music' : 'Unmute sound and music');
  // Browsers that can't vibrate (iPhone Safari, or this page embedded in another site) get a note on the switch
  document.querySelectorAll('#set-vibrate span, [data-set="vibrate"] span').forEach((el) => (el.innerHTML = canVibrate ? 'Vibration' : 'Vibration <small>(in the app)</small>'));
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

// ---------- Characters ----------
let wasSandy = false; // the ball was in a bunker last frame (for the crunch on the way in)
let lastCreature = -9;
/** The ball just hit something: if it's a character, it reacts (an elephant trumpets, a clown honks...). */
function creatureHit() {
  if (time - lastCreature < 0.8) return;
  const L = world.level, b = world.ball, t = world.time;
  const near = (x: number, y: number, r: number) => Math.hypot(b.x - x, b.y - y) < BALL_R + r + 8;
  const say = (f: () => void) => { lastCreature = time; f(); };
  if ((L.elephants ?? []).some((e) => near(e.x, e.y, e.r ?? 38))) return say(L.theme === 'arctic' ? sfx.bear : sfx.elephant);
  if ((L.penguins ?? []).some((c) => { const p = astronautAt(c, t); return near(p.x, p.y, 14); })) return say(sfx.penguin);
  if ((L.seals ?? []).some((c) => near(c.x, c.y, 26))) return say(sfx.seal);
  if ((L.gingerbread ?? []).some((c) => { const p = astronautAt(c, t); return near(p.x, p.y, 14); })) return say(sfx.gingerbread);
  if ((L.clowns ?? []).some((c) => { const p = astronautAt(c, t); return near(p.x, p.y, p.r); })) return say(sfx.clown);
  if ((L.mummies ?? []).some((c) => { const p = astronautAt(c, t); return near(p.x, p.y, p.r); })) return say(sfx.groanMummy);
  if ((L.astronauts ?? []).some((c) => { const p = astronautAt(c, t); return near(p.x, p.y, p.r); })) return say(sfx.astronaut);
  if ((L.aliens ?? []).some((a) => { const p = alienAt(a, t); return near(p.x, p.y, p.r); })) return say(sfx.alien);
  if ((L.dinos ?? []).some((d) => { const p = dinoPose(d, t); return near(p.x, p.y, 110); })) return say(sfx.roar);
  if ((L.palms ?? []).some((p) => near(p.x, p.y, 16))) return say(sfx.rustle);
}

// ---------- Haptics ----------
function buzz(style: ImpactStyle) {
  if (!settings.vibrate) return;
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
/** Tips for the hole on screen (none for trick shots and the shootout). */
function currentTips() {
  if (trick || shootout) return null;
  const at = whereIs(world.level);
  return at ? tipsFor(at.course, world.level.name) : null;
}

/** The tips panel for this hole: pauses play while it's open. */
let tipsResume = false;
function openTips() {
  const t = currentTips();
  if (!t) return;
  sfx.ui();
  tipsResume = phase === 'play';
  if (tipsResume) { phase = 'paused'; setRolling(0, false); }
  $('tips-title').textContent = `Tips · Hole ${holeIdx + 1} · ${world.level.name}`;
  const li = (items: string[]) => items.map((x) => `<li>${x.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</li>`).join('');
  $('tips-do').innerHTML = li(t.do);
  $('tips-avoid').innerHTML = li(t.avoid);
  $('tips-spin').innerHTML = t.spin ? `<b>🎱 Use spin:</b> ${li([t.spin]).replace(/<\/?li>/g, '')}` : '';
  $('tips-foot').classList.toggle('hidden', !!t.spin); // the general how-to-spin line, on holes without their own spin tip
  $('screen-tips').classList.remove('hidden');
}
function closeTips() {
  $('screen-tips').classList.add('hidden');
  if (tipsResume && phase === 'paused') phase = 'play';
  tipsResume = false;
}

function updateHud() {
  $('btn-tips').classList.toggle('hidden', !currentTips());
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
  if (demo) return; // the demo's captions say what's happening
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
  $('fs-tip').classList.toggle('off', id !== 'screen-title'); // the full-screen tip only shows on the main menu
  $('hud').classList.toggle('hidden', phase === 'title');
}

/** On the first hole of a player's first round, show a finger pulling back from the ball. */
function updateFinger() {
  if (demo) return; // the demo moves the finger itself
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
  holeStartedAt = performance.now();
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
  placeEight(L);
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
/** Which course and hole (1-based) a level is, for playtest records (trick shots aren't course holes). */
function whereIs(L: LevelDef) {
  const c = COURSES.find((k) => k.holes.includes(L));
  return c ? { course: c.id, hole: c.holes.indexOf(L) + 1 } : null;
}

function holeOut(score: number, pickedUp = false) {
  if (demo) { demo.sunkAt ??= demo.t; return; } // the demo's shot: no score, no stats
  const at = whereIs(world.level);
  if (at && !shootout && !(match && turn === 'ai')) {
    const mode = daily ? 'daily' : careerEvent ? 'career' : match ? 'vs' : practice ? 'practice' : 'round';
    track({ type: 'hole', ...at, name: world.level.name, par: world.level.par, strokes: score, mode, seconds: Math.round((performance.now() - holeStartedAt) / 1000), pickedUp });
    lastPlayed = { ...at, name: world.level.name, strokes: score };
  }
  if (shootout) shootoutShot(0);
  else if (match && turn === 'ai') finishAiHole(score);
  else if (match) { scores[holeIdx] = score; pendingBanked = sinkBanked; sinkBanked = false; startAiTurn(); }
  else finishHole(score, pickedUp);
}

/** The golden 8-ball still hidden on this hole, if any (never in the demo or trick shots). */
let eight: { course: string; hole: string; x: number; y: number } | null = null;
function placeEight(L: LevelDef) {
  const at = demo ? null : whereIs(L);
  const p = at && !P.eightFound(at.course, L.name) ? P.eightAt(at.course, L.name) : null;
  eight = at && p ? { course: at.course, hole: L.name, x: p[0], y: p[1] } : null;
  view3d.setEight(eight?.x ?? null, eight?.y);
}

/** Pick up the golden 8-ball when the player's ball rolls through it. */
function checkEight() {
  if (!eight || demo || shootout || turn !== 'player' || world.air || (world.ball.z ?? 0) > 10) return;
  if (Math.hypot(world.ball.x - eight.x, world.ball.y - eight.y) > 20) return;
  const n = P.takeEight(eight.course, eight.hole);
  eight = null;
  view3d.collectEight();
  addCoins(P.EIGHT_COINS);
  sfx.collect();
  buzz(ImpactStyle.Medium);
  toast(`Golden 8-ball! ${n}/${P.EIGHT_TOTAL} · +${P.EIGHT_COINS}`, 'good', 1800);
  const won: [string, number][] = [];
  const items: string[] = [];
  awardTrophies(won, items);
  const sum = won.reduce((a, [, c]) => a + c, 0);
  addCoins(sum);
  won.forEach(([name, c], i) => setTimeout(() => toast(`${name} +${c}${items[i] ? ` · ${items[i]}` : ''}`, 'good', 2400), 2000 + i * 2600));
  if (won.length) setTimeout(() => sfx.result(-1, false), 2000);
}

/** Pay out newly won trophies: coin lines (the caller adds them) and the names of designs they unlock. */
function awardTrophies(lines: [string, number][], unlocked: string[]) {
  for (const t of P.checkTrophies()) {
    lines.push([`🏆 ${t.name}`, t.coins]);
    unlocked.push((t.item && earn(t.item)) || '');
  }
}

/** Stars and activity counts for the player's finished hole; adds coin lines for new stars, returns the stars. */
function holeProgress(score: number, lines: [string, number][]) {
  const at = whereIs(world.level);
  if (!at) return null;
  const { stars, gained } = P.recordStars(at.course, world.level.name, score, world.level.par);
  if (gained) lines.push([`New star${gained > 1 ? 's' : ''} ${'★'.repeat(gained)}`, gained * P.STAR_COINS]);
  if (score === 1) P.bump('aces');
  return stars;
}
const starsHtml = (n: number | null) => (n == null ? '' : `<span class="hole-stars" title="${n} of 3 stars">${P.starRow(n)}</span>`);

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
  const stars = pickedUp ? null : holeProgress(score, lines);
  if (last && !practice) P.noteRound(COURSE.id);
  awardTrophies(lines, unlocked);
  $('hole-detail').insertAdjacentHTML('beforeend', starsHtml(stars));
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
const canAim = () => !demo && phase === 'play' && turn === 'player' && !world.moving && busyTimer <= 0 && trickReset <= 0 && !strike;

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!canAim() || drag) return;
  // Freeze the view's basis for this drag, so the camera can turn with the aim without
  // feeding back into it.
  const basis = view3d.aimBasis();
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, yaw: Math.atan2(basis.fwd.y, basis.fwd.x), pulled: false, basis };
  canvas.setPointerCapture(e.pointerId);
  aim.active = true;
  aim.power = 0;
  applyDrag();
  $('banner').classList.remove('show'); // get the hole banner out of the way of the shot
  updateHud();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  // Before pulling back, a sideways swipe spins the view quickly (a screen's width ≈ one full turn,
  // so you can face any way, even straight behind you); once pulling, sideways fine-tunes the aim.
  if (!drag.pulled && e.clientY - drag.sy > PULL_START) drag.pulled = true;
  const turn = drag.pulled ? AIM_TURN : (Math.PI * 2) / (window.innerWidth * 0.9);
  drag.yaw -= (e.clientX - drag.x) * turn;
  drag.x = e.clientX;
  drag.y = e.clientY;
  applyDrag();
});

/** Width of the screen-edge strips that keep the aim turning while the finger rests in them. */
const EDGE_ZONE = 0.12;
const EDGE_TURN = 1.4; // rad/s
/** How far down the finger moves before a drag counts as pulling the cue back. */
const PULL_START = 14;

/** Turn the current drag into aim direction and power (called on move and every frame). */
function applyDrag() {
  if (!drag) return;
  // Pull back like a cue: dragging down the screen shoots "into" the view.
  const mx = drag.x - drag.sx;
  const my = drag.y - drag.sy;
  const maxDrag = Math.min(window.innerHeight * 0.45, 260);
  const { fwd, right } = drag.basis;
  if (!view3d.isOverview) {
    // Shot camera: down sets power, sideways turns the aim (see pointermove), and holding near
    // a screen edge keeps turning
    aim.dx = Math.cos(drag.yaw);
    aim.dy = Math.sin(drag.yaw);
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
  drag.yaw -= side * EDGE_TURN * dt;
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
    if (!view3d.isOverview) view3d.faceYaw(Math.atan2(aim.dy, aim.dx)); // let go without shooting: keep looking where you turned
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
/** The title-screen speaker: mute sound effects and music together, or bring both back. */
function toggleMute() {
  const on = !(settings.sound || settings.music);
  if (settings.sound !== on) toggleSound();
  if (settings.music !== on) toggleMusic();
}
function toggleSound() { settings.sound = !settings.sound; setSound(settings.sound); localSet('sound', settings.sound ? '1' : '0'); syncSettingsUi(); }
function toggleMusic() { settings.music = !settings.music; setMusic(settings.music); localSet('music', settings.music ? '1' : '0'); syncSettingsUi(); }
function toggleVibrate() { settings.vibrate = !settings.vibrate; localSet('vibrate', settings.vibrate ? '1' : '0'); syncSettingsUi(); buzz(ImpactStyle.Medium); }
function toggleGuide() { settings.guide = !settings.guide; aim.guide = settings.guide ? 'full' : 'short'; localSet('guide', settings.guide ? 'full' : 'short'); syncSettingsUi(); }
function toggleArrows() { settings.arrows = !settings.arrows; view3d.setSlopeArrows(settings.arrows); localSet('arrows', settings.arrows ? '1' : '0'); syncSettingsUi(); }
function toggleFollow() { settings.follow = !settings.follow; view3d.follow = settings.follow; localSet('follow', settings.follow ? '1' : '0'); syncSettingsUi(); }
click('btn-view', toggleView);
click('btn-turn', () => { if (canAim() && !view3d.isOverview) view3d.turnAround(); });
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
      const found = P.eightFound(c.id, l.name);
      return `<button class="course" data-course="${c.id}" data-hole="${i}"><b>HOLE ${i + 1}</b><span>${l.name}</span><small>Par ${l.par}${hb ? ` · Best ${hb}` : ''}</small>`
        + `<em class="prog"><i class="stars">${P.starRow(P.starsOf(c.id, l.name))}</i><i class="eight${found ? ' got' : ''}" title="${found ? 'Golden 8-ball found' : 'A golden 8-ball is hidden here'}">8</i></em></button>`;
    }).join('');
    return `<div class="course-head${c.id === COURSE.id ? ' cur' : ''}"><div><h3>${c.name}</h3><small>${c.holes.length} holes · Par ${par}${best ? ` · Best ${best}` : ''} · ★ ${P.courseStars(c.id)}/${c.holes.length * 3} · <i class="eight got">8</i> ${P.eightsFound(c.id)}/${c.holes.length}</small></div>
      <button class="btn-gold small" data-play="${c.id}">PLAY</button></div><div class="courses">${cards}</div>`;
  }).join('');
  sheet('Courses', `<p>Play a full course, or tap any hole to practise it. Earn up to three stars a hole (par, birdie, hole in one) and hunt for the golden 8-ball hidden on each.</p>${sections}`);
  $('sheet-body').querySelectorAll<HTMLButtonElement>('.course').forEach((b) => {
    b.onclick = () => { sfx.ui(); chooseCourse(b.dataset.course!); playSingle(Number(b.dataset.hole)); };
  });
  $('sheet-body').querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) => {
    b.onclick = () => { sfx.ui(); chooseCourse(b.dataset.play!); startRound(); };
  });
}

function openSettings() {
  sheet('Settings', `<div class="settings">
    <button class="toggle" data-set="sound" aria-pressed="${settings.sound}"><span>Sound effects</span><em></em></button>
    <button class="toggle" data-set="music" aria-pressed="${settings.music}"><span>Music</span><em></em></button>
    <button class="toggle" data-set="vibrate" aria-pressed="${settings.vibrate}"><span>${canVibrate ? 'Vibration' : 'Vibration <small>(in the app)</small>'}</span><em></em></button>
    <button class="toggle" data-set="guide" aria-pressed="${settings.guide}"><span>Bank guide (two banks)</span><em></em></button>
    <button class="toggle" data-set="arrows" aria-pressed="${settings.arrows}"><span>Slope arrows</span><em></em></button>
    <button class="toggle" data-set="follow" aria-pressed="${settings.follow}"><span>Camera follows ball</span><em></em></button>
    <button class="toggle" data-set="top" aria-pressed="${settings.top}"><span>Whole-table camera</span><em></em></button></div>
    <button class="btn" id="btn-playtest">Playtest results</button>`);
  $('btn-playtest').onclick = () => void openPlaytest();
  $('sheet-body').querySelectorAll<HTMLButtonElement>('.toggle').forEach((b) => {
    b.onclick = () => {
      sfx.ui();
      const k = b.dataset.set as 'sound' | 'music' | 'vibrate' | 'guide' | 'follow' | 'top' | 'arrows';
      if (k === 'sound') toggleSound();
      if (k === 'music') toggleMusic();
      if (k === 'vibrate') toggleVibrate();
      if (k === 'guide') toggleGuide();
      if (k === 'follow') toggleFollow();
      if (k === 'arrows') toggleArrows();
      if (k === 'top') toggleView();
      b.setAttribute('aria-pressed', String(settings[k]));
    };
  });
}

/**
 * What feedback is about: the hole being played (from the pause menu), or from the main menu the last hole
 * finished this visit; null before any hole is played.
 */
function feedbackAbout() {
  if (phase !== 'title') { const at = whereIs(world.level); if (at) return { ...at, name: world.level.name, strokes, playing: true }; }
  return lastPlayed ? { ...lastPlayed, playing: false } : null;
}

/** The feedback form, over the menu or the pause screen, noting where the player is. */
function openFeedback() {
  sfx.ui();
  const fb = feedbackAbout();
  const course = fb && COURSES.find((c) => c.id === fb.course)!.name;
  $('fb-context').textContent = !fb ? `Tell us anything: bugs, ideas, what you love. Build ${BUILD}.`
    : fb.playing ? `About hole ${fb.hole} · ${fb.name} (${course}), ${fb.strokes} stroke${fb.strokes === 1 ? '' : 's'} so far. Build ${BUILD}.`
    : `About the last hole you played: hole ${fb.hole} · ${fb.name} (${course}), finished in ${fb.strokes}. Build ${BUILD}.`;
  ($('fb-name') as HTMLInputElement).value = testerName();
  $('screen-feedback').classList.remove('hidden');
}

/** Playtest results: average strokes per hole against par (hardest first) and the latest feedback. */
async function openPlaytest() {
  sheet('Playtest', '<p>Loading…</p>');
  const { records, everyone } = await loadRecords();
  if ($('sheet-title').textContent !== 'Playtest') return; // closed meanwhile
  const { holes, testers } = summarize(records);
  const name = (id: string) => COURSES.find((c) => c.id === id)?.name ?? id;
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const rows = holes.sort((a, b) => b.diff - a.diff).map((h) =>
    `<tr><td>${esc(name(h.course))} ${h.hole}</td><td>${esc(h.name)}</td><td class="num">${h.n}</td><td class="num">${h.par}</td><td class="num">${h.avg.toFixed(1)}</td><td class="num ${h.diff > 0.75 ? 'hard' : h.diff < -0.5 ? 'easy' : ''}">${h.diff >= 0 ? '+' : ''}${h.diff.toFixed(1)}</td></tr>`).join('');
  const fb = records.filter((r): r is PlaytestRecord & { type: 'feedback' } => r.type === 'feedback').sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
  const icon = { bug: '🐞', idea: '💡', love: '❤️' } as const;
  const items = fb.map((f) => `<li>${icon[f.kind] ?? ''} ${esc(f.text || '(no text)')}<small>${esc(f.testerName || 'Tester ' + f.tester)} · ${f.course === 'menu' ? 'menu' : esc(name(f.course)) + ' hole ' + f.hole} · ${esc(f.device)} · build ${esc(f.build)} · ${new Date(f.at).toLocaleString()}</small></li>`).join('');
  $('sheet-body').innerHTML = `<p>${everyone ? `Everyone's results on this game page: ${testers} tester${testers === 1 ? '' : 's'}.` : `Results played on this device.${PLAYTEST_URL ? ' Every tester\'s results also go to the playtest sheet.' : ''}`}</p>
    ${rows ? `<div class="card-wrap"><table class="pt-table"><tr><th>Hole</th><th></th><th>Plays</th><th>Par</th><th>Avg</th><th>vs par</th></tr>${rows}</table></div>` : '<p>No holes finished yet.</p>'}
    <h3>Feedback</h3>${items ? `<ul class="pt-fb">${items}</ul>` : '<p>None yet.</p>'}`;
}

/** Progress: hole stars, golden 8-balls and the trophy room, then this course's stats. */
function openStats() {
  const best = localGet(ck('best'));
  const holes = LEVELS.map((l, i) => `<td>${localGet(ck(`hole${i}`)) ?? '–'}</td>`).join('');
  const trophies = P.TROPHIES.map((tr) => {
    const done = P.trophyDone(tr), [have, goal] = tr.progress();
    const item = tr.item ? itemInfo(ACHIEVEMENTS[tr.item].item).name : '';
    return `<div class="trophy${done ? ' won' : ''}"><b>${done ? '🏆' : '🔒'}</b><span>${tr.name}</span><small>${tr.desc}</small>`
      + `<em>${done ? 'Won · ' : goal > 1 ? `${Math.min(have, goal)}/${goal} · ` : ''}<i class="coin"></i>${tr.coins}${item ? ` + ${item}` : ''}</em>`
      + (done || goal <= 1 ? '' : `<i class="bar"><i style="width:${Math.round((100 * Math.min(have, goal)) / goal)}%"></i></i>`) + '</div>';
  }).join('');
  sheet('Progress', `<div class="stats">
      <div class="stat"><b>★ ${P.totalStars()}<small>/${P.MAX_STARS}</small></b><span>Hole stars</span></div>
      <div class="stat"><b><i class="eight got">8</i> ${P.eightsFound()}<small>/${P.EIGHT_TOTAL}</small></b><span>Golden 8-balls</span></div>
      <div class="stat"><b>🏆 ${P.trophiesWon()}<small>/${P.TROPHIES.length}</small></b><span>Trophies</span></div>
    </div>
    <p>★ par · ★★ birdie · ★★★ hole in one, on each hole (+${P.STAR_COINS} coins a new star). Every hole hides a golden 8-ball (+${P.EIGHT_COINS}): roll through it to pick it up.</p>
    <h3>Trophy room</h3><div class="trophies">${trophies}</div>
    <h3>${COURSE.name}</h3>
    <div class="stats">
      <div class="stat"><b>${best ?? '–'}</b><span>Best round</span></div>
      <div class="stat"><b>${stat('rounds')}</b><span>Rounds finished</span></div>
      <div class="stat"><b>${stat('aces')}</b><span>Holes in one</span></div>
    </div>
    <div class="card-wrap"><table class="card"><tr><th>HOLE</th>${LEVELS.map((_, i) => `<td>${i + 1}</td>`).join('')}</tr>
    <tr><th>PAR</th>${LEVELS.map((l) => `<td>${l.par}</td>`).join('')}</tr><tr><th>BEST</th>${holes}</tr>
    <tr><th>★</th>${LEVELS.map((l) => `<td class="st">${P.starsOf(COURSE.id, l.name) || '–'}</td>`).join('')}</tr></table></div>
    <p>Progress is saved on this device only.</p>`);
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
    if (demo) return;
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
  const stars = holeProgress(you, lines);
  awardTrophies(lines, unlocked);
  $('hole-detail').insertAdjacentHTML('beforeend', starsHtml(stars));
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
  if (win) lines.push([firstWin ? 'Match won' : 'Rematch won', firstWin ? m.opp.reward : Math.round(m.opp.reward / 5)]);
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
    } else if (ev.type === 'launch') ({ cannon: sfx.cannon, seal: sfx.seal, ramp: sfx.whoosh, trampoline: sfx.boing, rocket: sfx.rocket, geyser: sfx.geyser })[ev.by]();
    else if (ev.type === 'teleport') (ev.via === 'igloo' ? sfx.igloo : sfx.portal)();
    else if (ev.type === 'chute') sfx.slide();
    else if (ev.type === 'ladder') sfx.ladder();
    else if (ev.type === 'drop') sfx.drop();
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
click('btn-feedback', () => openFeedback());
click('btn-demo', () => startDemo());
if (!localGet('demoSeen')) $('btn-demo').classList.add('pulse'); // until it's been watched once
click('btn-demo-skip', () => endDemo());
click('btn-tips', openTips);
click('btn-tips-close', closeTips);
click('btn-tips-ok', closeTips);
click('btn-pause-feedback', () => openFeedback());
click('btn-fb-close', () => $('screen-feedback').classList.add('hidden'));
document.querySelectorAll<HTMLButtonElement>('.fb-kind').forEach((b) => {
  b.onclick = () => { sfx.ui(); document.querySelectorAll('.fb-kind').forEach((k) => k.setAttribute('aria-pressed', String(k === b))); };
});
click('btn-fb-send', () => {
  const text = ($('fb-text') as HTMLTextAreaElement).value.trim();
  const kind = (document.querySelector('.fb-kind[aria-pressed="true"]') as HTMLElement | null)?.dataset.kind as 'bug' | 'idea' | 'love' ?? 'bug';
  if (text.length < 3 && kind !== 'love') { ($('fb-text') as HTMLTextAreaElement).focus(); toast('Tell us a little more', 'bad'); return; }
  setTesterName(($('fb-name') as HTMLInputElement).value);
  const fb = feedbackAbout();
  track({ type: 'feedback', kind, text, course: fb?.course ?? 'menu', hole: fb?.hole ?? 0, strokes: fb?.strokes ?? 0 });
  ($('fb-text') as HTMLTextAreaElement).value = '';
  $('screen-feedback').classList.add('hidden');
  toast('Thanks! Feedback sent', 'good', 1600);
});
void flush(); // anything that didn't get out last time (offline)

// ---------- How-to-play demo ----------
/**
 * A scripted hole on the main menu's "Watch how to play": a finger pulls back to aim (the guide runs into a
 * gumdrop), cancels, drags the spin pad to the right, aims a little left and pulls back again (the guide now
 * curves round it), and lets go; the ball curves round the gumdrop into the cup. The real game plays it.
 */
let demo: { t: number; shot: boolean; shotAt?: number; sunkAt?: number } | null = null;

function startDemo() {
  sfx.ui();
  unlockAudio();
  match = null; careerEvent = null; daily = null; trick = null; practice = true;
  holeIdx = 0;
  demo = { t: 0, shot: false };
  enterLevel(DEMO_LEVEL);
  $('hud').classList.add('demo');
  $('demo-ui').classList.remove('hidden');
  $('finger').classList.add('manual');
  localSet('demoSeen', '1');
  $('btn-demo').classList.remove('pulse');
}

function endDemo() {
  if (!demo) return;
  demo = null;
  aim.active = false; aim.power = 0; cue.visible = false; strike = null;
  setSpin(0, 0);
  $('hud').classList.remove('demo');
  $('demo-ui').classList.add('hidden');
  $('demo-caption').textContent = '';
  $('finger').classList.remove('manual');
  $('finger').classList.add('hidden');
  practice = false;
  toTitle();
}

function updateDemo(dt: number) {
  const d = demo!;
  d.t += dt;
  const t = d.t;
  const W = innerWidth, H = innerHeight;
  const S = { x: W * 0.62, y: H * 0.36 };
  const pull = Math.min(H * 0.45, 260) * DEMO_SHOT.power;
  const r = $('spin-ball').getBoundingClientRect();
  const pad = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const ease = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, u: number) => ({ x: a.x + (b.x - a.x) * ease(u), y: a.y + (b.y - a.y) * ease(u) });
  const say = (s: string) => { const c = $('demo-caption'); if (c.textContent !== s) c.textContent = s; };
  const f = $('finger');
  const finger = (p: { x: number; y: number } | null) => {
    f.classList.toggle('hidden', !p);
    if (p) { f.style.left = `${p.x}px`; f.style.top = `${p.y}px`; }
  };
  const aimAt = (deg: number, power: number) => {
    const a = (deg * Math.PI) / 180;
    aim.active = true; aim.dx = Math.cos(a); aim.dy = Math.sin(a); aim.power = power;
    updatePower();
  };
  const down = { x: S.x, y: S.y + pull }, downAim = { x: S.x + 40, y: S.y + pull };
  // If the shot ever comes to rest short (it shouldn't), wrap up anyway
  if (d.shot && d.sunkAt == null && !world.moving && !strike && t - d.shotAt! > 1.5) d.sunkAt = t;
  if (d.sunkAt != null) {
    say(fx.sink ? 'In the cup! Now it\'s your turn.' : 'Now it\'s your turn!');
    finger(null);
    if (t - d.sunkAt > 2.4) endDemo();
    return;
  }
  if (t > 30) { endDemo(); return; } // safety net: never get stuck in the demo
  if (t < 2.2) { say('Here\'s how to play: get the ball from the tee into the cup.'); finger(null); }
  else if (t < 4.2) { say('Pull back anywhere on the screen, like drawing back a cue. Further back = harder shot.'); finger(lerp(S, down, (t - 2.2) / 1.6)); aimAt(0, DEMO_SHOT.power * ease((t - 2.2) / 1.6)); }
  else if (t < 6.4) { say('The dotted guide shows where it will go… straight into that gumdrop!'); finger(down); aimAt(0, DEMO_SHOT.power); }
  else if (t < 7.2) { say('Slide back up to cancel. Let\'s add some spin.'); finger(lerp(down, S, (t - 6.4) / 0.8)); aimAt(0, DEMO_SHOT.power * (1 - ease((t - 6.4) / 0.8))); }
  else if (t < 8.0) { aim.active = false; aim.power = 0; updatePower(); finger(lerp(S, pad, (t - 7.2) / 0.8)); }
  else if (t < 9.6) {
    say('Drag the dot on the SPIN pad to the right: the ball will curve to the right.');
    const u = ease((t - 8.0) / 1.0);
    setSpin(DEMO_SHOT.side * u, 0);
    finger({ x: pad.x + DEMO_SHOT.side * 22 * u, y: pad.y });
  } else if (t < 10.4) { finger(lerp({ x: pad.x + DEMO_SHOT.side * 22, y: pad.y }, S, (t - 9.6) / 0.8)); }
  else if (t < 12.4) {
    say('Aim a little left and pull back again. Now the guide curves round the gumdrop.');
    const u = (t - 10.4) / 1.6;
    finger(lerp(S, downAim, u)); aimAt(DEMO_SHOT.deg * ease(u), DEMO_SHOT.power * ease(u));
  } else if (t < 13.6) { finger(downAim); aimAt(DEMO_SHOT.deg, DEMO_SHOT.power); }
  else if (!d.shot) {
    // Let go: the same strike a real release starts
    say('Let go to shoot!');
    d.shot = true;
    d.shotAt = t;
    finger(null);
    aimAt(DEMO_SHOT.deg, DEMO_SHOT.power);
    aim.active = false;
    strike = { t: 0, from: cue.pull, dur: 0.17 - 0.09 * DEMO_SHOT.power, p: DEMO_SHOT.power, fired: false };
    cue.ox = world.ball.x; cue.oy = world.ball.y;
  }
}

// ---------- Full screen in the browser ----------
/** Opened from the home screen (installed), so already full screen. */
const installed = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const inFrame = (() => { try { return window.top !== window.self; } catch { return true; } })();
const touch = matchMedia('(pointer: coarse)').matches;
if (!native && !installed && !inFrame && touch) {
  // Android browsers can go full screen and hold landscape from the first tap; iPhone browsers can't
  const goFull = () => {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: (o?: object) => Promise<void> };
    if (!document.fullscreenElement && document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => {});
    }
  };
  addEventListener('pointerup', goFull, { once: true });
  // One tip on how to get the full-screen, app-like version
  if (!localGet('fstip')) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    $('fs-tip-text').textContent = ios
      ? 'Full screen: open in Safari › Share › Add to Home Screen'
      : 'Full screen: browser menu ⋮ › Add to Home screen';
    $('fs-tip').classList.remove('hidden');
    click('btn-fs-tip', () => { $('fs-tip').classList.add('hidden'); localSet('fstip', '1'); });
  }
}

// ---------- Tester code (web playtest builds) ----------
/** The web version on a public host asks for the tester code once; the app, claude.ai and local runs don't. */
function testerGate() {
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  const embedded = (() => { try { return window.top !== window.self; } catch { return true; } })();
  if (!TESTER_CODE_HASH || native || local || embedded) return;
  if (localGet('access') === TESTER_CODE_HASH) return;
  const hash = (code: string) => sha256(`rack-and-roll:${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`);
  const gate = $('screen-gate'), input = $('gate-code') as HTMLInputElement;
  gate.classList.remove('hidden');
  const tryCode = () => {
    if (hash(input.value) === TESTER_CODE_HASH) { localSet('access', TESTER_CODE_HASH); gate.classList.add('hidden'); return; }
    $('gate-msg').textContent = "That code didn't work. Check the message you were sent.";
    const panel = gate.querySelector('.panel')!;
    panel.classList.remove('shake'); void (panel as HTMLElement).offsetWidth; panel.classList.add('shake');
  };
  click('btn-gate', tryCode);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryCode(); });
}
testerGate();
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
click('btn-more', () => sheet('How to play', `<p><b>Pull down</b> anywhere to draw the cue back (further for more power) and drag <b>sideways</b> to fine-tune your aim (hold near the screen edge to keep turning), then <b>release</b> to shoot. To face another way, <b>swipe sideways</b> before pulling down: one swipe across the screen turns you all the way round. The <b>↻</b> button turns you to face straight behind.</p>
  <p>The dotted guide shows your path through the first two banks. It doesn't bend for slopes: the drifting arrows on the turf show which way the ground falls, so aim a little uphill of your target. Water costs a stroke and puts the ball back. Sand slows it down. A hole ends after 10 strokes.</p>
  <p><b>Spin:</b> drag the red dot on the cue-ball pad (above the power bar) to strike off-centre. Left or right swerves the ball and kicks it off walls; top spin rolls on further, backspin bites and pulls back off a wall. Tap the middle to clear it.</p>
  <p>In the <b>Big Top Circus</b>, trampolines bounce the ball over anything in its way (faster in, further out) and cannons fire it across the tent the way the barrel points. Land outside the ring and it's <b>out of bounds</b>: +1 stroke and back to where you hit from.</p>
  <p>In <b>Pharaoh's Tomb</b>, roll into a teal scarab portal to come out of its violet partner; stone doors rise and sink on a timer; and quicksand grips the ball and drags it in: stop in it and it's swallowed (+1 stroke).</p>
  <p>In <b>Candy Land</b>, roll off the open edge of a cake layer to drop to the level below (edges with an icing rim are solid). Roll onto a <b>ladder</b>'s glowing foot to climb up a layer, and into a <b>chute</b>'s swirl to slide down one. Some chutes are shortcuts; some send you back to the start! Chocolate costs a stroke.</p>
  <p>Every course has <b>raised levels</b>. Look for the way up: a geyser in the canyon, a launch rocket on the moon, the cannon or a ladder in the circus, stairs or a portal in the tomb, and a ski lift in the Arctic. Watch out for a toboggan run behind the cup!</p>
  <p><b>Moving platforms</b> (ringed in yellow-and-black stripes) rise and sink on a timer. Roll onto one while it's down, wait for it to carry the ball up, then roll off onto the higher level while it's level.</p>
  <p>On <b>Arctic Peaks</b>, ice is slick, so the ball glides much further; holes in the ice cost a stroke. Roll up to a seal and it flips the ball over the obstacles with its tail. Hit a ski jump fast and straight to fly over walls. Roll into one igloo door to come out of the other.</p>
  <p><b>Vs Computer</b> is match play: you play each hole, then your rival does, and the lower score wins the hole. Beat each rival to unlock the next. All square after six holes? A closest-to-the-pin shootout settles it: one shot each, nearest the cup wins.</p>
  <p><b>Stars and treasure:</b> each hole has three stars to earn: ★ for par, ★★ for a birdie, ★★★ for a hole in one. Every hole also hides a spinning <b>golden 8-ball</b>, often up on a higher level or across a hazard: roll through it to collect it. Both pay coins, and the ★ button on the main menu opens the <b>trophy room</b>, where some trophies win designs you can't buy.</p>
  <p>A new <b>daily challenge</b> appears on the main menu every day: a hole with a goal (par or birdie) or a trick shot. Complete it for bonus coins and keep your 🔥 streak going.</p>
  <p>Every hole earns <b>coins</b>: more for par, birdies, bank shots and holes in one, plus a bonus for finishing a round. Spend them in <b>Cues &amp; Balls</b>; a few designs can only be won.</p>
  <p>Stuck on a hole? Tap the <b>💡</b> in the scorecard for tips on what works best there and what to avoid. It pauses the game while you read.</p>
  <p>The camera sits behind the ball and turns as you aim. Tap <b>TABLE</b> to see the whole hole, and <b>BALL</b> to come back.</p>`));
click('btn-title-sound', toggleMute);
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
click('set-music', toggleMusic);
click('set-vibrate', toggleVibrate);
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

  if (demo) updateDemo(dt);
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
  playMusic(phase === 'title' ? 'menu' : world.level.theme ?? 'candy');
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
        creatureHit();
        view3d.bounceBall(ev.speed);
        if (ev.speed > 400) buzz(ImpactStyle.Light);
        break;
      case 'wall':
        sfx.wall(ev.speed);
        creatureHit();
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
          if (why) { sfx.lip(); sfx.groan(); fx.sink = { t: 0 }; busyTimer = 1.3; toast(why, 'bad', 2600); break; }
        }
        sfx.sink();
        if (native && settings.vibrate) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        else if (settings.vibrate) navigator.vibrate?.([25, 60, 25, 60, 40]); // a celebratory triple buzz
        fx.sink = { t: 0 };
        busyTimer = 1.3;
        view3d.setMode('sink');
        const banks = world.contacts;
        const name = resultName(strokes, world.level.par);
        const good = strokes <= world.level.par;
        if (turn === 'ai' && match) { sfx.cheer(0); toast(`${match.opp.emoji} ${name}`, good ? 'bad' : 'good', 1200); break; }
        sinkBanked = banks > 0;
        if (!demo && !trick && !shootout && whereIs(world.level)) {
          if (banks > 0) P.bump('banks');
          if (Math.abs(lastSpin.side) >= 0.2) P.bump('spin');
          if (lastSpin.vert <= -0.2) P.bump('backspin');
        }
        // The crowd: a roar for an ace, cheers under par, applause for par, polite claps or an "ohh" after
        const d = strokes - world.level.par;
        if (trick || shootout) sfx.cheer(2);
        else if (strokes === 1) sfx.cheer(3);
        else if (d < 0) sfx.cheer(2);
        else if (d === 0) sfx.cheer(1);
        else if (d === 1) sfx.cheer(0);
        else sfx.groan();
        toast(banks > 0 ? `Bank shot · ${name}` : name, good ? 'good' : '', 1200);
        break;
      }
      case 'water':
        if (world.level.theme === 'jurassic') sfx.lava(); else if (world.level.theme === 'space') sfx.warp(); else if (world.level.theme === 'arctic') sfx.icewater(); else sfx.water();
        if (turn === 'player') sfx.groan();
        buzz(ImpactStyle.Heavy);
        fx.splash = { x: b.x, y: b.y, t: 0 };
        fx.ripples.push({ x: b.x, y: b.y, t: 0 }, { x: b.x, y: b.y, t: -0.25 });
        view3d.splash(b.x, b.y);
        strokes++;
        busyTimer = 1.0;
        toast({ jurassic: 'Lava! +1 stroke', space: 'Lost in space! +1 stroke', garden: 'Splash! +1 stroke', circus: 'Splash! +1 stroke', tomb: 'Splash! +1 stroke', arctic: 'Through the ice! +1 stroke', candy: 'Chocolate dip! +1 stroke' }[world.level.theme ?? 'garden'], 'bad');
        updateHud();
        break;
      case 'launch':
        if (turn === 'player' && !demo) P.noteLaunch(ev.by);
        if (ev.by === 'cannon') { sfx.cannon(); view3d.shake(4); buzz(ImpactStyle.Heavy); toast('BOOM!', 'good', 700); }
        else if (ev.by === 'seal') { sfx.seal(); buzz(ImpactStyle.Medium); toast('Flipped!', 'good', 700); }
        else if (ev.by === 'ramp') { sfx.whoosh(); buzz(ImpactStyle.Medium); toast('Airborne!', 'good', 700); }
        else if (ev.by === 'rocket') { sfx.rocket(); view3d.shake(3); buzz(ImpactStyle.Heavy); toast('Blast off!', 'good', 900); }
        else if (ev.by === 'geyser') { sfx.geyser(); view3d.shake(2); buzz(ImpactStyle.Heavy); toast('Geyser!', 'good', 900); }
        else { sfx.boing(); buzz(ImpactStyle.Medium); toast('Boing!', 'good', 600); }
        break;
      case 'land':
        sfx.land();
        view3d.bounceBall(700);
        break;
      case 'teleport':
        if (turn === 'player' && !demo) P.bump('portals');
        if (ev.via === 'igloo') sfx.igloo(); else sfx.portal();
        buzz(ImpactStyle.Light);
        break;
      case 'chute': {
        if (turn === 'player' && !demo) P.bump('chutes');
        sfx.slide();
        buzz(ImpactStyle.Light);
        // A chute that ends further from the cup than it starts is a snake in the board game
        const c = (world.level.chutes ?? []).find((k) => Math.hypot(b.x - k.path[0][0], b.y - k.path[0][1]) < 30);
        const [cx, cy] = world.level.cup, end = c?.path[c.path.length - 1];
        const back = !!end && Math.hypot(end[0] - cx, end[1] - cy) > Math.hypot(b.x - cx, b.y - cy) + 150;
        const name = world.level.theme === 'arctic' ? 'toboggan' : world.level.theme === 'circus' ? 'slide' : 'chute';
        toast(back ? `Down the ${name}! Back you go` : 'Wheee!', back ? 'bad' : 'good', 1000);
        break;
      }
      case 'ladder':
        if (turn === 'player' && !demo) P.bump('ladders');
        sfx.ladder();
        buzz(ImpactStyle.Light);
        toast(world.level.theme === 'arctic' ? 'All aboard the ski lift!' : world.level.theme === 'tomb' ? 'Up the stairs!' : 'Up the ladder!', 'good', 900);
        break;
      case 'drop':
        sfx.drop();
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
        if (turn === 'player') sfx.groan();
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
  checkEight();
  const sandy = (world.level.sand ?? []).some((z) => inZone(z, b.x, b.y));
  if (sandy && !wasSandy && world.moving) sfx.sand(Math.hypot(b.vx, b.vy));
  wasSandy = sandy;
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
