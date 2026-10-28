import './style.css';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';
import { ALL_COURSES, COURSE, CourseDef, COURSES, EXPERT, inSeason, LevelDef, LEVELS, SEASONAL, setCourse } from './levels';
import { alienAt, astronautAt, BALL_R, dinoPose, inZone, MAX_SHOT_SPEED, routeDistance, shotSpeed, World } from './physics';
import { AimState, CueState, FX, Renderer3D } from './render3d';
import { loadModels } from './models';
import { ballPreview, BALLS, cuePreview, CUES } from './gear';
import { bestScore, bestStars, CareerEvent, EVENTS, isUnlocked, recordEvent, STAR_COINS, starText, TIERS, totalStars } from './career';
import { HoleRecorder, sampleShot, Shot } from './replay';
import { execute, hasMovers, Opponent, OPPONENTS, Planner } from './ai';
import { bestToday, Daily, dailyCourse, dailyFor, dailyName, dateLabel, isDoneToday, recordDaily, streak, today, untilTomorrow } from './daily';
import { checkRule, courseName, isDone, markDone, ruleText, Trick, TRICKS } from './tricks';
import { ACHIEVEMENTS, addCoins, buy, coins, dailyTopUp, earn, holeReward, isOwned, itemInfo, ItemKey, roundReward, TOP_UP } from './wallet';
import { setAudioPaused, setMusic, setRolling, setSound, sfx, unlockAudio } from './audio';
import { playMusic } from './music';
import { PLAYTEST_URL, TESTER_CODE_HASH } from './playtest.config';
import { sha256 } from './sha256';
import { tipsFor } from './tips';
import { DEMO_LEVEL, DEMO_SHOT } from './demo';
import * as P from './progress';
import { COACH_STEPS, COURSE_INTROS } from './coach';
import { Challenge, challengeFromUrl, challengeLink, clearChallengeUrl, shareChallenge } from './challenge';
import { adStatus, adsAvailable, adsRemoved, buyRemoveAds, canPurchase, coinAdsLeft, initAds, maybeInterstitial, noteCoinAd, privacyChoices, removeAdsPrice, restorePurchases, showRewarded } from './ads';
import { AD_COINS } from './ads.config';
import { bookReminder, canRemind, maybeAskForRating, remindersOn, setReminders } from './nudges';
import { BUILD, flush, loadRecords, PlaytestRecord, setSharing, setTesterName, sharing, summarize, testerName, track, watchErrors } from './telemetry';

const MAX_STROKES = 10;
declare const __VERSION__: string;
const APP_VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '';
/** The game's web home: privacy policy and support pages. */
const SITE = 'https://cnmbuck1.github.io/poolgolf/';
/** Aim turn per pixel of sideways drag on the shot camera (radians). */
const AIM_TURN = 0.004;
const native = Capacitor.isNativePlatform();
/**
 * Whether this device can vibrate here: always in the app (native haptics); on the web only where the
 * Vibration API exists and the page isn't embedded in another site (browsers block it in embedded frames).
 */
const canVibrate = native || ('vibrate' in navigator && (() => { try { return window.top === window.self || window.top!.location.origin === location.origin; } catch { return false; } })());

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const canvas = $<HTMLCanvasElement>('game');
const view3d = new Renderer3D(canvas);

type Phase = 'title' | 'play' | 'paused' | 'holeDone' | 'replay';

let phase: Phase = 'title';
let holeIdx = 0;
let holeStartedAt = 0; // for playtest records: how long each hole took
/** The last hole the player finished, so feedback sent from the main menu afterwards is tied to it. */
let lastPlayed: { course: string; hole: number; name: string; strokes: number } | null = null;
/** The courses that can be played today: the regular six, plus any holiday course in its season. */
function playable() { return [...COURSES, ...SEASONAL.filter((c) => inSeason(c)), ...EXPERT.filter(expertOpen)]; }
/** Hole stars earned on the six regular courses (what unlocks the expert courses). */
function regularStars() { return COURSES.reduce((a, c) => a + P.courseStars(c.id), 0); }
/** An expert course opens once enough stars are earned (or, for testing, after five taps on its locked tile). */
function expertOpen(c: CourseDef) { return !c.unlockStars || regularStars() >= c.unlockStars || localGet(`unlock.${c.id}`) === '1'; }
// A holiday course chosen last season falls back to the first course once its season is over
setCourse(playable().some((c) => c.id === localGet('course')) ? localGet('course')! : 'candy');
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
let dailyPrevCourse: string | null = null; // the course chosen on the menu before a daily hole switched it
let daily: Daily | null = null; // today's daily challenge, while it's being played
/** A match against a computer opponent: both players' scores per hole. */
let match: { opp: Opponent; ai: (number | null)[]; stake: number } | null = null;
/** Pass-and-play: friends sharing this phone take turns on each hole. */
interface PartyPlayer { name: string; ball: string }
let party: { players: PartyPlayer[]; cur: number; scores: (number | null)[][] } | null = null;
/** A friend's "beat my score" challenge being played, from a link. */
let challenge: Challenge | null = null;
let turn: 'player' | 'ai' = 'player'; // whose turn it is on the hole, in a match
let pendingPickedUp = false; // the player picked up on this hole of a match (no record, no hole coins)
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
  $('btn-turn').setAttribute('aria-label', view3d.isOverview ? 'View the table from the other side' : 'Turn around');
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
  // When a course, match, event or trick is over and the main button goes somewhere other than the menu
  // (Play again, Opponents, Career, Courses, Trick shots), offer the main menu beside it
  if (id === 'btn-next') $('btn-hole-menu').classList.toggle('hidden', ['MENU', 'NEXT HOLE', 'SHOOTOUT'].includes(text));
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
  if ((L.nutcrackers ?? []).some((c) => { const p = astronautAt(c, t); return near(p.x, p.y, 14); })) return say(sfx.nutcracker);
  if ((L.pirates ?? []).some((c) => { const p = astronautAt(c, t); return near(p.x, p.y, 15); })) return say(sfx.pirate);
  if ((L.parrots ?? []).some((a) => { const p = alienAt(a, t); return near(p.x, p.y, 11); })) return say(sfx.parrot);
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
  // Starting a hole over is for practice and trick shots; in a round, career event or match it would be a free mulligan
  const canRestart = practice || !!trick;
  $('btn-restart').classList.toggle('hidden', !canRestart);
  $('btn-pause-restart').classList.toggle('hidden', !canRestart);
  $('hud-hole').textContent = trick ? '★' : String(holeIdx + 1);
  $('hud-par').textContent = String(world.level.par);
  $('hud-strokes').textContent = String(trick ? attempts : strokes);
  $('hud-name').textContent = party ? `${party.players[party.cur].name}'s turn` : world.level.name;
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
  // Over a menu or result screen the top bar is covered, so the message floats above the screen instead
  const overScreen = [...document.querySelectorAll('.screen')].some((el) => !el.classList.contains('hidden'));
  if (!overScreen) fitTopSlot();
  if (overScreen) $('toast').className = 'toast'; else $('float-toast').className = 'toast float';
  const t = $(overScreen ? 'float-toast' : 'toast');
  t.textContent = msg;
  t.className = `toast ${overScreen ? 'float ' : ''}show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

function banner() {
  $('banner-hole').innerHTML = daily ? 'DAILY CHALLENGE' : trick ? 'TRICK SHOT' : party ? `HOLE <b>${holeIdx + 1}</b> · ${esc(party.players[party.cur].name.toUpperCase())}'S TURN` : `HOLE <b>${holeIdx + 1}</b>`;
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

// ---------- First-time help ----------
/** How far a new player is through the coach bubbles (players from before the coach existed skip it). */
let coachStep = Number(localGet('coach') ?? (localGet('tutorial') === '1' ? COACH_STEPS.length : 0));
let coachShown = false;
function setCoachStep(n: number) { coachStep = n; localSet('coach', String(n)); }
/** Show the next coach bubble while the player is lining up a shot; the last one waits for the start of a hole. */
function updateCoach() {
  const ready = coachStep < COACH_STEPS.length && phase === 'play' && !demo && !shootout && turn === 'player'
    && !world.moving && busyTimer <= 0 && !strike && $('screen-intro').classList.contains('hidden')
    && (coachStep < 3 ? strokes >= coachStep || coachStep === 0 : strokes === 0);
  if (ready !== coachShown || (ready && $('coach-text').dataset.step !== String(coachStep))) {
    coachShown = ready;
    $('coach').classList.toggle('hidden', !ready);
    if (ready) { $('coach-text').innerHTML = COACH_STEPS[coachStep]; $('coach-text').dataset.step = String(coachStep); }
  }
  $('coach').classList.toggle('dim', ready && aim.active);
  $('hint').style.visibility = ready ? 'hidden' : ''; // the bubble says it better than the one-line hint
  $('spin').classList.toggle('pulse', ready && coachStep === 2);
}
/** A shot was taken: the bubble on screen has done its job. */
function coachShot() { if (coachShown) setCoachStep(coachStep + 1); }

/** The first time a course is played: a card naming what's new there. */
function maybeIntro(L: LevelDef) {
  const at = demo ? null : whereIs(L);
  const intro = at && COURSE_INTROS[at.course];
  if (!at || !intro || localGet(`intro.${at.course}`)) return;
  localSet(`intro.${at.course}`, '1');
  $('intro-kicker').textContent = 'NEW COURSE';
  $('btn-intro-alt').classList.add('hidden');
  $('intro-icon').textContent = intro.icon;
  $('intro-title').textContent = ALL_COURSES.find((c) => c.id === at.course)!.name;
  $('intro-points').innerHTML = intro.points.map((p) => `<li>${p}</li>`).join('');
  $('screen-intro').classList.remove('hidden');
}

/** The very first time the game opens: what it is, where to start, and the demo. */
function maybeWelcome() {
  if (localGet('welcomed')) return;
  localSet('welcomed', '1');
  if (localGet('tutorial') === '1') return; // played before this card existed
  $('intro-kicker').textContent = 'WELCOME';
  $('intro-icon').textContent = '🎱';
  $('intro-title').textContent = 'Rack & Roll';
  $('intro-points').innerHTML = [
    'Mini golf played with a pool cue: <b>pull back</b> anywhere to draw the cue, and <b>let go</b> to shoot.',
    '<b>Six worlds</b> and 36 holes. Start with <b>Career</b>, or pick any course.',
    'Earn coins and stars, hunt the hidden <b>golden 8-balls</b>, and unlock new balls and cues.',
  ].map((p) => `<li>${p}</li>`).join('');
  $('btn-intro-alt').classList.remove('hidden');
  $('screen-intro').classList.remove('hidden');
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
function loadTrick(t: Trick, fresh = true) {
  endParty();
  shootout = null;
  shootoutPending = false;
  trick = t;
  match = null;
  practice = false;
  careerEvent = null;
  if (fresh) attempts = 0; // a restart or "Try again" keeps counting tries
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
  maybeIntro(L);
  strokes = 0;
  lastRest = { x: world.ball.x, y: world.ball.y };
  fx.sink = undefined;
  fx.splash = undefined;
  sinkBanked = false;
  clearLater();
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
  endParty();
  practice = false;
  careerEvent = ev;
  daily = null;
  match = null;
  scores = LEVELS.map(() => null);
  loadHole(0);
  if (ev) toast(`${ev.name} · shoot ${ev.target} or better`, 'good', 2600);
}

function playSingle(i: number) {
  endParty();
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
  const c = ALL_COURSES.find((k) => k.holes.includes(L));
  return c ? { course: c.id, hole: c.holes.indexOf(L) + 1 } : null;
}

function holeOut(score: number, pickedUp = false) {
  if (demo) { demo.sunkAt ??= demo.t; return; } // the demo's shot: no score, no stats
  const at = whereIs(world.level);
  if (party) { partyHoleOut(score, pickedUp); return; }
  if (at && !shootout && !(match && turn === 'ai')) {
    const mode = daily ? 'daily' : careerEvent ? 'career' : match ? 'vs' : practice ? 'practice' : 'round';
    track({ type: 'hole', ...at, name: world.level.name, par: world.level.par, strokes: score, mode, seconds: Math.round((performance.now() - holeStartedAt) / 1000), pickedUp });
    lastPlayed = { ...at, name: world.level.name, strokes: score };
  }
  if (shootout) shootoutShot(0);
  else if (match && turn === 'ai') finishAiHole(score);
  else if (match) { scores[holeIdx] = score; pendingPickedUp = pickedUp; pendingBanked = !pickedUp && sinkBanked; sinkBanked = false; startAiTurn(); }
  else finishHole(score, pickedUp);
}

/** Toasts and sounds scheduled for later in a hole; cleared when the player leaves it. */
let laterTimers: number[] = [];
const later = (fn: () => void, ms: number) => { laterTimers.push(window.setTimeout(fn, ms)); };
function clearLater() { laterTimers.forEach(clearTimeout); laterTimers = []; }

/** The golden 8-ball still hidden on this hole, if any (never in the demo or trick shots). */
let eight: { course: string; hole: string; x: number; y: number } | null = null;
function placeEight(L: LevelDef) {
  const at = demo || party ? null : whereIs(L);
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
  won.forEach(([name, c], i) => later(() => toast(`${name} +${c}${items[i] ? ` · ${items[i]}` : ''}`, 'good', 2400), 2000 + i * 2600));
  if (won.length) later(() => sfx.result(-1, false), 2000);
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
  const prevBest = localGet(ck(`hole${holeIdx}`));
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
  $('btn-replay').classList.toggle('hidden', !practice); // a round's holes count once

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
  // Practice (and daily retries) pay hole coins only for a new best on that hole, so one easy hole can't be farmed
  const paysHole = !pickedUp && (!practice || prevBest == null || score < Number(prevBest));
  const lines = paysHole ? holeReward(score, par, sinkBanked) : [];
  const unlocked: string[] = [];
  if (!pickedUp && score === 1) { unlocked.push(earn('ace') ?? ''); maybeAskForRating(stat('rounds')); }
  if (last && !practice) {
    const d = roundToPar();
    lines.push(...roundReward(d));
    if (d < 0) unlocked.push(earn('underPar') ?? '');
    if (d <= 0) maybeAskForRating(stat('rounds'));
    if (COURSE.id === 'space') unlocked.push(earn('lunar') ?? '');
  }
  if (daily?.kind === 'hole') {
    // Daily challenge: meet the day's goal for the daily coins and to keep the streak going
    const d = daily;
    const r = pickedUp ? null : recordDaily(d, score);
    if (r) lines.push(...r.coins);
    if (r) { void bookReminder(true, streak()); if (r.met) setTimeout(offerReminder); }
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
    const newBest = $('hole-detail').textContent!.includes('New best round') ? ' · New best round!' : '';
    $('hole-detail').innerHTML = (r.stars
      ? `<span class="stars">${starText(r.stars)}</span> Target ${ev.target} · ${r.firstClear ? 'Event cleared!' : 'Cleared'}`
      : `Target ${ev.target} · missed by ${total - ev.target}. Try again!`) + newBest;
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
    : practice && !pickedUp ? `<small>Beat your best here (${prevBest}) to earn coins in practice</small>` : '';
  if ((last && !practice) || daily) offerDouble(lines);
  // Replay: the whole hole, with a hole in one finishing in slow motion
  setupShare(score, pickedUp, last);
  const ace = recorder.shots.some((x) => x.ace);
  $('btn-watch').classList.toggle('hidden', !recorder.shots.length);
  $('btn-watch').innerHTML = `<svg><use href="#i-play"/></svg>${ace ? 'SLOW-MO REPLAY' : 'WATCH REPLAY'}`;
  $('btn-watch').setAttribute('aria-label', ace ? 'Slow-motion replay' : 'Watch replay');
  updateHud();
  show('screen-hole');
}

// ---------- Ads ----------
/** After a round, a match or a daily challenge: the player may watch an ad to double the coins just won (trophy coins aside). */
function offerDouble(lines: [string, number][]) {
  const earned = lines.filter(([l]) => !l.startsWith('🏆')).reduce((a, [, n]) => a + n, 0);
  if (!adsAvailable || earned <= 0) return;
  const b = document.createElement('button');
  b.className = 'btn ad-btn';
  b.innerHTML = `<svg><use href="#i-play"/></svg>Watch an ad to double: <i class="coin"></i>+${earned} more`;
  b.onclick = async () => {
    unlockAudio();
    b.disabled = true;
    if (!(await showRewarded())) { b.disabled = false; toast('Watch the whole ad to double your coins', '', 1800); return; }
    addCoins(earned);
    sfx.collect();
    const done = document.createElement('span');
    done.className = 'unlock';
    done.textContent = `Doubled! +${earned} more coins`;
    b.replaceWith(done);
    updateHud();
  };
  $('hole-coins').append(b);
}

/** After a daily challenge goal is met, once: offer the daily reminder (it's also in Settings). */
function offerReminder() {
  if (!canRemind || localGet('remind') != null) return;
  const b = document.createElement('button');
  b.className = 'btn ad-btn';
  b.textContent = "🔔 Remind me about tomorrow's challenge";
  b.onclick = async () => {
    b.disabled = true;
    const on = await setReminders(true, true, streak());
    b.textContent = on ? "✓ We'll remind you at 6 pm" : 'Notifications are off for Rack & Roll (turn them on in iPhone Settings)';
  };
  $('hole-coins').append(b);
}

/** A button for coins from an ad (in the shop and on Vs Computer), a few times a day. `after` refreshes the screen. */
function coinAdButton(after: () => void) {
  if (!adsAvailable || coinAdsLeft(today()) <= 0) return '';
  setTimeout(() => {
    const b = document.getElementById('btn-coin-ad') as HTMLButtonElement | null;
    if (!b) return;
    b.onclick = async () => {
      unlockAudio();
      b.disabled = true;
      if (!(await showRewarded())) { b.disabled = false; toast('Watch the whole ad to earn the coins', '', 1800); return; }
      addCoins(AD_COINS);
      noteCoinAd(today());
      sfx.collect();
      toast(`+${AD_COINS} coins`, 'good', 1200);
      after();
    };
  });
  return `<button class="btn ad-btn" id="btn-coin-ad"><svg><use href="#i-play"/></svg>Watch an ad: <i class="coin"></i>+${AD_COINS}</button>`;
}

/** Settings: Remove ads (or a thank-you), Restore purchases, and Google's privacy choices. */
function adsSettingsHtml() {
  if (!canPurchase) return '';
  setTimeout(() => {
    const buy = document.getElementById('btn-noads') as HTMLButtonElement | null;
    if (buy) {
      void removeAdsPrice().then((p) => { const s = buy.querySelector('b'); if (s) s.textContent = p; });
      buy.onclick = async () => {
        const note = (t: string) => { const m = document.getElementById('noads-msg'); if (m) { m.textContent = t; m.classList.toggle('bad', !!t); } };
        buy.disabled = true;
        note('');
        const { result, detail } = await buyRemoveAds();
        buy.disabled = false;
        // Said on the panel itself (a toast would be hidden behind it)
        if (result === 'done') { sfx.collect(); toast('Ads removed. Thank you!', 'good', 2000); openSettings(); }
        else if (result === 'unavailable') note(`Remove ads isn't available from the App Store right now. Please try again later.${detail ? ` (${detail})` : ''}`);
        else if (result === 'failed') note(`The purchase didn't go through. Please try again later.${detail ? ` (${detail})` : ''}`);
      };
    }
    const rest = document.getElementById('btn-restore') as HTMLButtonElement | null;
    if (rest) rest.onclick = async () => {
      rest.disabled = true;
      const ok = await restorePurchases();
      rest.disabled = false;
      if (ok) { toast('Purchase restored: ads removed', 'good', 2000); openSettings(); return; }
      const m = document.getElementById('noads-msg');
      if (m) { m.textContent = 'No purchases to restore on this Apple ID.'; m.classList.remove('bad'); }
    };
    const priv = document.getElementById('btn-adprivacy');
    if (priv) priv.onclick = () => void privacyChoices();
  });
  return `<div class="ads-box">${adsRemoved()
    ? '<p class="noads-done">✓ Ads removed. Thank you for supporting Rack &amp; Roll!</p>'
    : '<button class="btn-gold small" id="btn-noads">Remove ads · <b>…</b></button><p id="noads-msg" class="noads-msg"></p><p>Turns off the full-screen ads during and after courses for good. Ads you choose to watch for coins stay available.</p>'}
    <div class="ads-row"><button class="btn" id="btn-restore">Restore purchases</button>${native ? '<button class="btn" id="btn-adprivacy">Ad privacy choices</button>' : ''}</div></div>`;
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
  // In season, the holiday course leads the course icons on the menu and the course row says so
  const special = SEASONAL.filter((c) => inSeason(c));
  document.querySelector('#btn-courses .course-icons')!.textContent = special.map((c) => COURSE_LOOK[c.id].icon).join('') + '🍭🦖🌙🎪🏺❄️';
  $('btn-courses').classList.toggle('special', special.length > 0);
  const topped = dailyTopUp(today());
  for (const c of EXPERT) if (c.unlockStars && regularStars() >= c.unlockStars && !localGet(`unlocked.${c.id}`)) {
    localSet(`unlocked.${c.id}`, '1');
    setTimeout(() => { sfx.collect(); toast(`${COURSE_LOOK[c.id].icon} ${c.name} unlocked! An expert course, in Pick a course`, 'good', 3500); }, 600);
  }
  $('menu-coins').innerHTML = `<i class="coin"></i>${coins()}`;
  const best = localGet(ck('best'));
  $('best').textContent = topped ? `Daily top-up: +${topped} coins` : best ? `${COURSE.name} best round: ${best}` : '';
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
  if (phase !== 'play' || demo) return;
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
  coachShot();
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
function toggleVibrate() {
  settings.vibrate = !settings.vibrate;
  localSet('vibrate', settings.vibrate ? '1' : '0');
  syncSettingsUi();
  // Turning it on gives a full test buzz: in-game taps are lighter, and iPhone only plays them with
  // Settings → Sounds & Haptics → System Haptics switched on
  if (settings.vibrate && native) void Haptics.vibrate({ duration: 300 }).catch(() => {});
  else buzz(ImpactStyle.Medium);
}
function toggleGuide() { settings.guide = !settings.guide; aim.guide = settings.guide ? 'full' : 'short'; localSet('guide', settings.guide ? 'full' : 'short'); syncSettingsUi(); }
function toggleArrows() { settings.arrows = !settings.arrows; view3d.setSlopeArrows(settings.arrows); localSet('arrows', settings.arrows ? '1' : '0'); syncSettingsUi(); }
function toggleFollow() { settings.follow = !settings.follow; view3d.follow = settings.follow; localSet('follow', settings.follow ? '1' : '0'); syncSettingsUi(); }
click('btn-view', toggleView);
click('btn-turn', () => {
  if (view3d.isOverview) view3d.flipTable(); // whole-table view: see it from the other side
  else if (canAim()) view3d.turnAround();
});
click('btn-restart', () => { if (phase === 'play' && (practice || trick)) { if (trick) loadTrick(trick, false); else loadHole(holeIdx); } });
click('btn-pause-restart', () => { if (!practice && !trick) return; if (trick) loadTrick(trick, false); else loadHole(holeIdx); });
click('btn-replay', () => { if (match || (!practice && !trick)) return; if (trick) { loadTrick(trick, false); return; } scores[holeIdx] = null; loadHole(holeIdx); });
click('btn-quit', toTitle);

function toTitle() {
  if (demo) { endDemo(); return; } // endDemo comes back here once the demo is cleared
  endParty();
  challenge = null;
  shootout = null;
  shootoutPending = false;
  cue.visible = false; strike = null; aim.active = false; aim.power = 0; aiShot = null;
  clearLater();
  $('screen-intro').classList.add('hidden');
  if (dailyPrevCourse) { const c = dailyPrevCourse; dailyPrevCourse = null; chooseCourse(c); }
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
  $('sheet-body').parentElement!.scrollTop = 0; // a new sheet starts at the top, title and close button showing
  show('screen-sheet');
}
click('btn-sheet-close', () => { refreshTitle(); show('screen-title'); });

/** Each course's badge and colours for the course picker. */
const COURSE_LOOK: Record<string, { icon: string; bg: string; badge?: string }> = {
  candy: { icon: '🍭', bg: 'linear-gradient(160deg, #ff8fc8, #c35c9a 55%, #5fae8a)' },
  jurassic: { icon: '🦖', bg: 'linear-gradient(160deg, #e8913f, #9a4516 60%, #4a2410)' },
  space: { icon: '🌙', bg: 'linear-gradient(160deg, #6a70b0, #2a2d5a 55%, #0e0f22)' },
  circus: { icon: '🎪', bg: 'linear-gradient(160deg, #f4c542, #d8303c 55%, #7a1420)' },
  halloween: { icon: '🎃', bg: 'linear-gradient(160deg, #ff8a1a, #6a2a8a 55%, #1a1030)', badge: 'HALLOWEEN SPECIAL' },
  pirate: { icon: '🏴‍☠️', bg: 'linear-gradient(160deg, #3ad0e0, #1a7ab0 50%, #3a2a18)', badge: 'EXPERT' },
  christmas: { icon: '🎄', bg: 'linear-gradient(160deg, #e8f4ff, #d8303c 50%, #1f6a3e)', badge: 'CHRISTMAS SPECIAL' },
  tomb: { icon: '🏺', bg: 'linear-gradient(160deg, #f0d08a, #c08a3a 55%, #6a4518)' },
  arctic: { icon: '❄️', bg: 'linear-gradient(160deg, #e6f4ff, #7ab4e4 55%, #2e5e94)' },
};

/** Pick a course: a tile per course to play a round, or open its holes to practise one. */
function openCourses(holesOf?: string) {
  if (holesOf) return openCourseHoles(holesOf);
  // Holiday courses come first in their season (with a badge), and show when they're back the rest of the year
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const seasonal = SEASONAL.map((c) => {
    const look = COURSE_LOOK[c.id];
    if (inSeason(c)) return null;
    return `<div class="ctile off" data-off="${c.id}" style="background:${look.bg}"><div class="ctile-play"><i class="ctile-icon">${look.icon}</i><b>${c.name}</b>
      <small>Holiday special · back in ${months[c.season!.from[0] - 1]}</small></div></div>`;
  }).filter(Boolean).join('');
  // Expert courses follow the regular ones: locked (with the stars still to earn) until they're opened
  const locked = EXPERT.filter((c) => !expertOpen(c)).map((c) => {
    const look = COURSE_LOOK[c.id], have = regularStars();
    return `<div class="ctile off" data-lock="${c.id}" style="background:${look.bg}"><em class="ctile-badge">EXPERT</em><div class="ctile-play"><i class="ctile-icon">🔒</i><b>${c.name}</b>
      <small>Earn ${c.unlockStars! - have} more ★ to unlock</small><small class="ctile-prog">★ ${have}/${c.unlockStars} on the regular courses</small></div></div>`;
  }).join('');
  const open = [...SEASONAL.filter((c) => inSeason(c)), ...COURSES, ...EXPERT.filter(expertOpen)];
  const tiles = open.map((c) => {
    const best = localGet(ck('best', c.id));
    const par = c.holes.reduce((a, l) => a + l.par, 0);
    const look = COURSE_LOOK[c.id];
    return `<div class="ctile${c.id === COURSE.id ? ' cur' : ''}" style="background:${look.bg}">
      ${look.badge ? `<em class="ctile-badge"${c.season && !inSeason(c, new Date(), true) ? ` data-preview="${c.id}">PREVIEW · ${months[c.season.from[0] - 1].slice(0, 3).toUpperCase()} ${c.season.from[1]}` : `>${look.badge}`}</em>` : ''}<button class="ctile-play" data-play="${c.id}"><i class="ctile-icon">${look.icon}</i><b>${c.name}</b>
        <small>${c.holes.length} holes · Par ${par}${best ? ` · Best ${best}` : ''}</small>
        <small class="ctile-prog">★ ${P.courseStars(c.id)}/${c.holes.length * 3} · <i class="eight got">8</i> ${P.eightsFound(c.id)}/${c.holes.length}</small></button>
      <button class="ctile-holes" data-holes="${c.id}">HOLES ›</button></div>`;
  }).join('');
  sheet('Pick a course', `<p>Tap a course to play a round, or <b>Holes</b> to practise one hole.</p><div class="ctiles">${tiles}${locked}${seasonal}</div>`);
  const body = $('sheet-body');
  body.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) => {
    b.onclick = () => { sfx.ui(); chooseCourse(b.dataset.play!); startRound(); };
  });
  body.querySelectorAll<HTMLButtonElement>('[data-holes]').forEach((b) => {
    b.onclick = () => { sfx.ui(); openCourseHoles(b.dataset.holes!); };
  });
  // Holiday preview, for trying a holiday course before it opens: tap its greyed-out tile five times in a row
  // (and its PREVIEW badge five times to hide it again). Only on this device.
  const taps = (el: Element, on: boolean) => {
    let n = 0, last = 0;
    (el as HTMLElement).onclick = (e) => {
      e.stopPropagation();
      const t = performance.now();
      n = t - last < 1500 ? n + 1 : 1;
      last = t;
      if (n < 5) return;
      try { if (on) localStorage.setItem('poolgolf.seasonOpen', '1'); else localStorage.removeItem('poolgolf.seasonOpen'); } catch { /* ignore */ }
      sfx.collect();
      openCourses();
    };
  };
  body.querySelectorAll('[data-off]').forEach((el) => taps(el, true));
  // The same five taps open a locked expert course early, for testing
  body.querySelectorAll<HTMLElement>('[data-lock]').forEach((el) => {
    let n = 0, last = 0;
    el.onclick = () => {
      const t = performance.now();
      n = t - last < 1500 ? n + 1 : 1;
      last = t;
      if (n === 1) toast(`Earn ${EXPERT.find((c) => c.id === el.dataset.lock)!.unlockStars} ★ on the regular courses to unlock`, '', 1800);
      if (n < 5) return;
      localSet(`unlock.${el.dataset.lock}`, '1');
      sfx.collect();
      openCourses();
    };
  });
  body.querySelectorAll('[data-preview]').forEach((el) => taps(el, false));
}

/** One course's holes, to practise any of them. */
function openCourseHoles(id: string) {
  const c = ALL_COURSES.find((k) => k.id === id)!;
  const best = localGet(ck('best', c.id));
  const par = c.holes.reduce((a, l) => a + l.par, 0);
  const cards = c.holes.map((l, i) => {
    const hb = localGet(ck(`hole${i}`, c.id));
    const found = P.eightFound(c.id, l.name);
    return `<button class="course" data-hole="${i}"><b>HOLE ${i + 1}</b><span>${l.name}</span><small>Par ${l.par}${hb ? ` · Best ${hb}` : ''}</small>`
      + `<em class="prog"><i class="stars">${P.starRow(P.starsOf(c.id, l.name))}</i><i class="eight${found ? ' got' : ''}" title="${found ? 'Golden 8-ball found' : 'A golden 8-ball is hidden here'}">8</i></em></button>`;
  }).join('');
  sheet(c.name, `<div class="course-head"><div><button class="back-link" id="btn-courses-back">‹ All courses</button><small>${c.holes.length} holes · Par ${par}${best ? ` · Best ${best}` : ''} · ★ ${P.courseStars(c.id)}/${c.holes.length * 3} · <i class="eight got">8</i> ${P.eightsFound(c.id)}/${c.holes.length}</small></div>
      <button class="btn-gold small" id="btn-course-round">PLAY ROUND</button></div>
    <p>Tap a hole to practise it (practice pays coins when you beat your best on that hole). Earn up to three stars a hole (par, birdie, hole in one) and hunt for the golden 8-ball hidden on each.</p><div class="courses">${cards}</div>`);
  const body = $('sheet-body');
  body.querySelectorAll<HTMLButtonElement>('[data-hole]').forEach((b) => {
    b.onclick = () => { sfx.ui(); chooseCourse(c.id); playSingle(Number(b.dataset.hole)); };
  });
  $('btn-course-round').onclick = () => { sfx.ui(); chooseCourse(c.id); startRound(); };
  $('btn-courses-back').onclick = () => { sfx.ui(); openCourses(); };
}

function openSettings() {
  sheet('Settings', `<div class="settings">
    <button class="toggle" data-set="sound" aria-pressed="${settings.sound}"><span>Sound effects</span><em></em></button>
    <button class="toggle" data-set="music" aria-pressed="${settings.music}"><span>Music</span><em></em></button>
    <button class="toggle" data-set="vibrate" aria-pressed="${settings.vibrate}"><span>${canVibrate ? 'Vibration' : 'Vibration <small>(in the app)</small>'}</span><em></em></button>
    <button class="toggle" data-set="guide" aria-pressed="${settings.guide}"><span>Bank guide (two banks)</span><em></em></button>
    <button class="toggle" data-set="arrows" aria-pressed="${settings.arrows}"><span>Slope arrows</span><em></em></button>
    <button class="toggle" data-set="follow" aria-pressed="${settings.follow}"><span>Follow the ball</span><em></em></button>
    <button class="toggle" data-set="top" aria-pressed="${settings.top}"><span>Whole-table camera</span><em></em></button>
    <button class="toggle" data-set="share" aria-pressed="${sharing()}"><span>Share anonymous play stats</span><em></em></button>
    ${canRemind ? `<button class="toggle" data-set="remind" aria-pressed="${remindersOn()}"><span>Daily challenge reminder <small>(6 pm)</small></span><em></em></button>` : ''}</div>
    ${adsSettingsHtml()}
    ${native ? '' : '<button class="btn" id="btn-playtest">Playtest results</button>'}
    <button class="btn reset" id="btn-reset">Reset all progress</button>
    <p class="about">Rack &amp; Roll ${APP_VERSION} (${BUILD}) · © ${new Date().getFullYear()} Cnmbuck Studios<br>
      <a href="${SITE}privacy.html" target="_blank" rel="noopener">Privacy policy</a> · <a href="${SITE}support.html" target="_blank" rel="noopener">Support</a></p>`);
  if (!native) $('btn-playtest').onclick = () => void openPlaytest();
  // Testing aid: five taps on the version line show why the last full-screen ad did or didn't appear
  let aboutTaps = 0;
  (document.querySelector('#sheet-body .about') as HTMLElement).onclick = (e) => {
    if ((e.target as HTMLElement).closest('a') || ++aboutTaps < 5) return;
    aboutTaps = 0;
    const old = document.getElementById('ad-status');
    if (old) { old.remove(); return; }
    const p = document.createElement('p');
    p.id = 'ad-status';
    p.className = 'ad-status';
    p.textContent = adStatus();
    $('sheet-body').append(p);
    p.scrollIntoView({ block: 'end' });
  };
  // Two taps: the first asks, the second wipes everything and starts the game again as a new player
  $('btn-reset').onclick = () => {
    sfx.ui();
    const b = $('btn-reset');
    if (!b.classList.contains('confirm')) {
      b.classList.add('confirm');
      b.textContent = 'Tap again to erase coins, designs, stars and scores';
      return;
    }
    resetProgress();
  };
  $('sheet-body').querySelectorAll<HTMLButtonElement>('.toggle').forEach((b) => {
    b.onclick = () => {
      sfx.ui();
      if (b.dataset.set === 'share') { setSharing(!sharing()); b.setAttribute('aria-pressed', String(sharing())); return; }
      if (b.dataset.set === 'remind') {
        void setReminders(!remindersOn(), isDoneToday(dailyFor(today())), streak()).then((on) => {
          b.setAttribute('aria-pressed', String(on));
          if (!on && b.dataset.want === '1') toast('Notifications are off for Rack & Roll: turn them on in iPhone Settings', 'bad', 2600);
        });
        b.dataset.want = remindersOn() ? '0' : '1';
        return;
      }
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

/** Erase this phone's progress (keeping the tester code and any stats still waiting to be sent) and restart as a brand-new player. */
function resetProgress() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith('poolgolf.') && !['poolgolf.access', 'poolgolf.playtest.outbox', 'poolgolf.noads'].includes(k)) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k)); // in the app this also clears the kept copy (see boot.ts)
  } catch { /* storage blocked: nothing to erase */ }
  // Give the app storage a moment to catch up before starting again
  setTimeout(() => location.reload(), 400);
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
  const course = fb && ALL_COURSES.find((c) => c.id === fb.course)!.name;
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
  const name = (id: string) => ALL_COURSES.find((c) => c.id === id)?.name ?? id;
  const rows = holes.sort((a, b) => b.diff - a.diff).map((h) =>
    `<tr><td>${esc(name(h.course))} ${h.hole}</td><td>${esc(h.name)}</td><td class="num">${h.n}</td><td class="num">${h.par}</td><td class="num">${h.avg.toFixed(1)}</td><td class="num ${h.diff > 0.75 ? 'hard' : h.diff < -0.5 ? 'easy' : ''}">${h.diff >= 0 ? '+' : ''}${h.diff.toFixed(1)}</td></tr>`).join('');
  const fb = records.filter((r): r is PlaytestRecord & { type: 'feedback' } => r.type === 'feedback').sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
  const icon = { bug: '🐞', idea: '💡', love: '❤️' } as const;
  const errs = records.filter((r): r is PlaytestRecord & { type: 'error' } => r.type === 'error').sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 20)
    .map((e) => `<li>⚠️ ${esc(e.message)}<small>${e.course === 'menu' ? 'menu' : `${esc(name(e.course))} hole ${e.hole}`} · ${esc(e.mode)} · ${esc(e.device)} ${esc(e.screen)} · build ${esc(e.build)} · ${new Date(e.at).toLocaleString()}</small></li>`).join('');
  const items = fb.map((f) => `<li>${icon[f.kind] ?? ''} ${esc(f.text || '(no text)')}<small>${esc(f.testerName || 'Tester ' + f.tester)} · ${f.course === 'menu' ? 'menu' : esc(name(f.course)) + ' hole ' + f.hole} · ${esc(f.device)} · build ${esc(f.build)} · ${new Date(f.at).toLocaleString()}</small></li>`).join('');
  $('sheet-body').innerHTML = `<p>${everyone ? `Everyone's results on this game page: ${testers} tester${testers === 1 ? '' : 's'}.` : `Results played on this device.${PLAYTEST_URL ? ' Every tester\'s results also go to the playtest sheet.' : ''}`}</p>
    ${rows ? `<div class="card-wrap"><table class="pt-table"><tr><th>Hole</th><th></th><th>Plays</th><th>Par</th><th>Avg</th><th>vs par</th></tr>${rows}</table></div>` : '<p>No holes finished yet.</p>'}
    <h3>Feedback</h3>${items ? `<ul class="pt-fb">${items}</ul>` : '<p>None yet.</p>'}
    ${errs ? `<h3>Errors</h3><ul class="pt-fb">${errs}</ul>` : ''}`;
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
const preview = (key: string, make: () => string) => {
  const hit = previews.get(key);
  if (hit) return hit;
  const url = make();
  if (url.length > 64) previews.set(key, url); // a failed (blank) drawing is tried again next time
  return url;
};

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
  sheet('Cues & Balls', `<div class="gear-top"><p id="gear-msg">Earn coins on every hole, then unlock new balls and cues. Some can only be won.</p><b class="wallet"><i class="coin"></i><span id="gear-coins">${coins()}</span></b>${coinAdButton(openGear)}</div>
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

// ---------- Beat my score ----------
/** On a finished practice hole or round: the challenge verdict (when playing one) and the share button. */
/** "Challenge a friend" links: off for 1.0 (incoming links still work). */
const CHALLENGES = false;
function setupShare(score: number, pickedUp: boolean, last: boolean) {
  const round = !practice && last;
  const ok = CHALLENGES && !pickedUp && !daily && !trick && !match && !party && whereIs(world.level) && (practice || round);
  $('btn-share').classList.toggle('hidden', !ok);
  if (!ok) return;
  const total = round ? scores.reduce<number>((a, b) => a + (b ?? 0), 0) : score;
  const ch = challenge && ((challenge.kind === 'hole' && practice && challenge.course === COURSE.id && challenge.hole === holeIdx)
    || (challenge.kind === 'round' && round && challenge.course === COURSE.id)) ? challenge : null;
  let verdict = '';
  if (ch) {
    verdict = total < ch.score ? `You beat ${ch.name}'s ${ch.score}!` : total === ch.score ? `Tied with ${ch.name} on ${ch.score}` : `${ch.name}'s ${ch.score} stands. Try again!`;
    $('hole-detail').innerHTML = `<b class="verdict ${total < ch.score ? 'won' : total === ch.score ? 'tie' : 'lost'}">${esc(verdict)}</b> ${$('hole-detail').innerHTML}`;
    if (total < ch.score) sfx.cheer(3);
  }
  $('btn-share').textContent = ch ? `Send ${ch.name} your score` : 'Challenge a friend';
  $('btn-share').onclick = async () => {
    sfx.ui();
    // The name friends see: asked once, then remembered
    let name = localGet('name') ?? '';
    if (!name) {
      name = (window.prompt('Your name, so your friend knows who to beat:', testerName()) ?? '').trim().slice(0, 20);
      if (!name) return;
      localSet('name', name);
    }
    const where = round ? `around ${COURSE.name}` : `on ${world.level.name} (${COURSE.name})`;
    const text = ch && total < ch.score ? `Beat your ${ch.score}, ${ch.name}: I got ${total} ${where} in Rack & Roll. Your turn!`
      : `I got ${total} ${where} in Rack & Roll. Can you beat it?`;
    const url = challengeLink({ kind: round ? 'round' : 'hole', course: COURSE.id, hole: holeIdx, score: total, name });
    const how = await shareChallenge(text, url);
    if (how === 'copied') { $('btn-share').textContent = 'Link copied: paste it to a friend'; }
  };
}

/** Start a friend's challenge from a link: the same hole or round, with their score to beat. */
function startChallenge(ch: Challenge) {
  chooseCourse(ch.course);
  if (ch.kind === 'hole') playSingle(ch.hole); else startRound();
  challenge = ch;
  later(() => toast(`Beat ${ch.name}'s ${ch.score}${ch.kind === 'round' ? ' for the round' : ''}!`, 'good', 3200), 1200);
}

// ---------- Pass and play ----------
/** Balls friends can pick from in pass-and-play (any design, owned or not: it's their ball for the game). */
const PARTY_BALLS = ['cue', 'eight', 'beach', 'watermelon', 'tennis', 'basketball', 'smiley', 'tiedye'];

/** Set up a pass-and-play game: 2–4 players with names and balls, and a course. */
function openParty() {
  const saved: PartyPlayer[] = (() => { try { return JSON.parse(localGet('party.players') ?? '[]'); } catch { return []; } })();
  const players: PartyPlayer[] = [0, 1, 2, 3].map((i) => ({ name: saved[i]?.name ?? `Player ${i + 1}`, ball: saved[i]?.ball ?? PARTY_BALLS[i] }));
  let count = Math.min(4, Math.max(2, Number(localGet('party.count') ?? 2)));
  let courseId = playable().some((c) => c.id === localGet('party.course')) ? localGet('party.course')! : COURSE.id;
  const draw = () => {
    const rows = players.slice(0, count).map((p, i) => `<div class="pp-row">
        <button class="pp-ball" data-ball="${i}" aria-label="Change ${esc(p.name)}'s ball"><img alt="" src="${preview(`b:${p.ball}`, () => ballPreview(p.ball))}"></button>
        <input class="pp-name" data-name="${i}" maxlength="14" value="${esc(p.name)}" aria-label="Player ${i + 1} name"></div>`).join('');
    const chips = playable().map((c) => `<button class="tab${c.id === courseId ? ' on' : ''}" data-pcourse="${c.id}">${COURSE_LOOK[c.id].icon} ${c.name.toUpperCase()}</button>`).join('');
    sheet('Play with friends', `<p>Pass the phone: everyone plays each hole in turn, and the lowest total wins. Tap a ball to change it.</p>
      <div class="pp-count"><span>Players</span>${[2, 3, 4].map((n) => `<button class="tab${n === count ? ' on' : ''}" data-count="${n}">${n}</button>`).join('')}</div>
      <div class="pp-rows">${rows}</div><div class="tabs chips">${chips}</div>
      <button class="btn-gold" id="btn-party-go">TEE OFF<svg><use href="#i-chev"/></svg></button>`);
    const body = $('sheet-body');
    body.querySelectorAll<HTMLInputElement>('[data-name]').forEach((inp) => { inp.oninput = () => { players[Number(inp.dataset.name)].name = inp.value; }; });
    body.querySelectorAll<HTMLButtonElement>('[data-ball]').forEach((b) => {
      b.onclick = () => {
        sfx.ui();
        const p = players[Number(b.dataset.ball)];
        const taken = new Set(players.slice(0, count).filter((q) => q !== p).map((q) => q.ball));
        let k = PARTY_BALLS.indexOf(p.ball);
        do k = (k + 1) % PARTY_BALLS.length; while (taken.has(PARTY_BALLS[k]));
        p.ball = PARTY_BALLS[k];
        b.querySelector('img')!.src = preview(`b:${p.ball}`, () => ballPreview(p.ball));
      };
    });
    body.querySelectorAll<HTMLButtonElement>('[data-count]').forEach((b) => { b.onclick = () => { sfx.ui(); count = Number(b.dataset.count); draw(); }; });
    body.querySelectorAll<HTMLButtonElement>('[data-pcourse]').forEach((b) => { b.onclick = () => { sfx.ui(); courseId = b.dataset.pcourse!; draw(); }; });
    $('btn-party-go').onclick = () => {
      sfx.ui();
      const list = players.slice(0, count).map((p, i) => ({ name: p.name.trim() || `Player ${i + 1}`, ball: p.ball }));
      localSet('party.players', JSON.stringify(players));
      localSet('party.count', String(count));
      localSet('party.course', courseId);
      startParty(list, courseId);
    };
  };
  draw();
}

function startParty(players: PartyPlayer[], courseId: string) {
  chooseCourse(courseId);
  practice = false; careerEvent = null; daily = null; match = null; trick = null;
  party = { players, cur: 0, scores: players.map(() => LEVELS.map(() => null)) };
  scores = party.scores[0];
  loadHole(0);
  partyTurn();
}

/** The current player is up: their ball, their scorecard on the HUD, and a call to pass the phone. */
function partyTurn() {
  const pt = party!, p = pt.players[pt.cur];
  scores = pt.scores[pt.cur];
  view3d.setBall(p.ball);
  banner();
  updateHud();
  toast(`${p.name}, you're up!`, 'good', 2000);
}

/** A player has finished the hole: the next player tees off, or everyone has and the hole's result shows. */
function partyHoleOut(score: number, pickedUp: boolean) {
  const pt = party!;
  pt.scores[pt.cur][holeIdx] = score;
  if (pickedUp) toast(`${pt.players[pt.cur].name} picks up`, 'bad', 1500);
  if (pt.cur < pt.players.length - 1) {
    pt.cur++;
    enterLevel(LEVELS[holeIdx]);
    partyTurn();
    return;
  }
  phase = 'holeDone';
  setRolling(0, false);
  const last = holeIdx === LEVELS.length - 1;
  const total = (i: number) => pt.scores[i].reduce<number>((a, b) => a + (b ?? 0), 0);
  const hole = pt.players.map((_, i) => pt.scores[i][holeIdx]!);
  const low = Math.min(...hole), winners = pt.players.filter((_, i) => hole[i] === low);
  const best = Math.min(...pt.players.map((_, i) => total(i))), leaders = pt.players.filter((_, i) => total(i) === best);
  const names = (list: PartyPlayer[]) => list.map((p) => esc(p.name)).join(' & ');
  const h = $('hole-result');
  if (last) {
    $('hole-kicker').textContent = `${COURSE.name.toUpperCase()} · FINAL`;
    h.innerHTML = leaders.length === 1 ? `${names(leaders)} wins!` : `${names(leaders)} tie!`;
    h.className = 'ace';
    $('hole-detail').textContent = `Lowest total: ${best}`;
    sfx.cheer(3);
  } else {
    $('hole-kicker').textContent = `HOLE ${holeIdx + 1} · ${world.level.name.toUpperCase()}`;
    h.innerHTML = winners.length === 1 ? `${names(winners)} takes the hole` : winners.length === pt.players.length ? 'Hole halved' : `${names(winners)} share the hole`;
    h.className = 'under';
    $('hole-detail').innerHTML = leaders.length === 1 ? `${names(leaders)} leads on ${best}` : `${names(leaders)} lead on ${best}`;
    sfx.result(-1, low === 1);
  }
  $('hole-coins').innerHTML = '';
  const head = LEVELS.map((_, i) => `<td class="${i === holeIdx ? 'cur' : ''}">${i + 1}</td>`).join('');
  const rows = pt.players.map((p, pi) => `<tr><th>${esc(p.name.slice(0, 8).toUpperCase())}</th>${LEVELS.map((l, i) => {
    const s = pt.scores[pi][i];
    return `<td class="${s == null ? '' : s < l.par ? 'under' : s > l.par ? 'over' : ''}">${s ?? '–'}</td>`;
  }).join('')}<td class="total">${total(pi)}</td></tr>`).join('');
  $('hole-card').innerHTML = `<table class="card"><tr><th>HOLE</th>${head}<th>TOT</th></tr>
    <tr><th>PAR</th>${LEVELS.map((l) => `<td>${l.par}</td>`).join('')}<td>${LEVELS.reduce((a, l) => a + l.par, 0)}</td></tr>${rows}</table>`;
  $('btn-replay').classList.add('hidden');
  $('btn-watch').classList.add('hidden');
  setLabel('btn-next', last ? 'MENU' : 'NEXT HOLE');
  show('screen-hole');
}

function partyNext() {
  const pt = party!;
  if (holeIdx === LEVELS.length - 1) { toTitle(); return; }
  pt.cur = 0;
  loadHole(holeIdx + 1);
  partyTurn();
}

/** Leave pass-and-play: back to this phone's own ball. */
function endParty() {
  if (!party) return;
  party = null;
  view3d.setBall(localGet('ball') ?? 'cue');
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
  const saved = localGet('vs.course');
  const courseId = saved && playable().some((c) => c.id === saved) ? saved : COURSE.id;
  const chips = playable().map((c) => `<button class="tab${c.id === courseId ? ' on' : ''}" data-vcourse="${c.id}">${COURSE_LOOK[c.id].icon} ${c.name.toUpperCase()}</button>`).join('');
  const cards = OPPONENTS.map((o, i) => {
    const open = vsUnlocked(i), w = vsGet(`${o.id}.wins`), l = vsGet(`${o.id}.losses`);
    return `<button class="course opp${open ? '' : ' locked'}" data-opp="${o.id}"${open ? '' : ' disabled'}>
      <span class="avatar" style="background:${o.color}">${o.emoji}</span>
      <span>${o.name}</span><small>${open ? o.blurb : `Beat ${OPPONENTS[i - 1].name} to unlock`}</small>
      <em class="stars">${w || l ? `W ${w} · L ${l}` : `First win <i class="coin"></i>${o.reward}`}</em>
      <em class="stake${o.stake > coins() ? ' short' : ''}">${o.stake ? `Stake <i class="coin"></i>${o.stake} · win ${o.stake * 2}` : 'Free to play'}</em></button>`;
  }).join('');
  sheet('Vs Computer', `<div class="gear-top"><p id="vs-msg">Play each hole in turn; the lower score wins it, and most holes wins the match. Win to double your stake; lose or quit and it's gone.</p><b class="wallet"><i class="coin"></i>${coins()}</b></div>
    <div class="tabs chips">${chips}</div><div class="courses opps">${cards}</div>`);
  const body = $('sheet-body');
  body.querySelectorAll<HTMLButtonElement>('[data-vcourse]').forEach((b) => {
    b.onclick = () => { sfx.ui(); localSet('vs.course', b.dataset.vcourse!); body.querySelectorAll('[data-vcourse]').forEach((x) => x.classList.toggle('on', x === b)); };
  });
  body.querySelectorAll<HTMLButtonElement>('[data-opp]').forEach((b) => {
    b.onclick = () => {
      sfx.ui();
      const opp = OPPONENTS.find((o) => o.id === b.dataset.opp)!;
      if (opp.stake > coins()) {
        const m = $('vs-msg');
        m.innerHTML = `${opp.name}'s stake is ${opp.stake} coins; you have ${coins()}. Earn more by playing a course, the daily challenge or trick shots, or play Rookie Ricky for free.`
          + (coins() < TOP_UP ? ` Running low? You're topped up to ${TOP_UP} coins once a day.` : '')
          + coinAdButton(openVersus);
        m.classList.add('bad');
        return;
      }
      const vc = localGet('vs.course');
      startMatch(opp, vc && playable().some((c) => c.id === vc) ? vc : COURSE.id);
    };
  });
}

function startMatch(opp: Opponent, courseId: string) {
  chooseCourse(courseId);
  startRound();
  match = { opp, ai: LEVELS.map(() => null), stake: Math.min(opp.stake, coins()) };
  addCoins(-match.stake);
  updateHud();
  toast(`${opp.emoji} ${opp.name} · ${match.stake ? `${match.stake} coins at stake · ` : ''}you're up first`, 'good', 2400);
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
  if (!pendingPickedUp) recordHole(holeIdx, you);
  const up = matchUp();
  const standing = up > 0 ? `You're ${up} UP` : up < 0 ? `${m.opp.name} is ${-up} UP` : 'All square';
  const h = $('hole-result');
  h.textContent = you < aiScore ? 'You win the hole!' : you > aiScore ? `${m.opp.name} wins the hole` : 'Hole halved';
  h.className = you < aiScore ? 'under' : you > aiScore ? 'over' : 'par';
  $('hole-kicker').textContent = `HOLE ${holeIdx + 1} · VS ${m.opp.name.toUpperCase()}`;
  $('hole-detail').textContent = `You ${you} · ${m.opp.name} ${aiScore} · ${standing}`;
  const lines = pendingPickedUp ? [] : holeReward(you, par, pendingBanked);
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
  const stars = pendingPickedUp ? null : holeProgress(you, lines);
  awardTrophies(lines, unlocked);
  $('hole-detail').insertAdjacentHTML('beforeend', starsHtml(stars));
  const earned = lines.reduce((a, [, n]) => a + n, 0);
  addCoins(earned);
  pendingBanked = false;
  $('hole-coins').innerHTML = `<b><i class="coin"></i>+${earned}</b><small>${lines.map(([l, n]) => `${l} +${n}`).join(' · ')}</small>`
    + (unlocked.some(Boolean) ? `<span class="unlocks">${unlocked.filter(Boolean).map((n) => `<span class="unlock">${n.includes('challenges') ? n : `Unlocked: ${n}`}!</span>`).join('')}</span>` : '');
  if (last && !shootoutPending) offerDouble(lines);
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
  if (win) maybeAskForRating(stat('rounds'));
  const key = win ? 'wins' : 'losses';
  localSet(`vs.${m.opp.id}.${key}`, String(vsGet(`${m.opp.id}.${key}`) + 1));
  const h = $('hole-result');
  $('hole-kicker').textContent = `MATCH COMPLETE · VS ${m.opp.name.toUpperCase()}`;
  h.textContent = win ? 'You win the match!' : `${m.opp.name} wins`;
  h.className = win ? 'ace' : 'over';
  $('hole-detail').textContent = detail + (!win && m.stake ? ` · Stake of ${m.stake} lost` : '');
  if (win && m.stake) lines.push(['Stake ×2', m.stake * 2]);
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
    for (let d = 30; d <= r && open; d += 10) {
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
      // Routes may cross quicksand now, but the shootout line should be clear of it
      open = Number.isFinite(routeDistance(w, px, py)) && !(L.quicksand ?? []).some((z) => inZone(z, px, py));
    }
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
  offerDouble(lines);
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
    if (d.course !== COURSE.id) dailyPrevCourse ??= COURSE.id; // put the menu's course back afterwards
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
  if (r) { void bookReminder(true, streak()); if (r.met) setTimeout(offerReminder); }
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
  $('btn-watch').innerHTML = '<svg><use href="#i-play"/></svg>SLOW-MO REPLAY';
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
    const cards = evs.map((ev) => {
      const open = isUnlocked(ev), best = bestScore(ev);
      const course = COURSES.find((c) => c.id === ev.course)!.name;
      const note = open ? `Shoot ${ev.target} or better${best != null ? ` · Best ${best}` : ''}` : 'Locked';
      return `<button class="course event${open ? '' : ' locked'}" data-event="${ev.id}"${open ? '' : ' disabled'}><b>${COURSE_LOOK[ev.course].icon} ${course.toUpperCase()}</b><span>${ev.name}</span><small>${note}</small><em class="stars">${starText(bestStars(ev))}</em></button>`;
    }).join('');
    const sub = isUnlocked(evs[0])
      ? `Target ${t.toPar > 0 ? `${t.toPar} over par` : t.toPar < 0 ? `${-t.toPar} under par` : 'par'} · ${t.reward} coins per event cleared`
      : `Clear every ${TIERS[ti - 1].name} event to open`;
    return `<div class="course-head"><div><h3>${t.name}</h3><small>${sub}</small></div></div><div class="courses">${cards}</div>`;
  }).join('');
  sheet('Career', `<div class="tabs"><button class="tab on">TOURS</button><button class="tab" data-tab="tricks">TRICK SHOTS</button></div><div class="gear-top"><p>Play the events in any order; clear them all to open the next tour. Beat the target by 2 for a second star and by 4 for a third; every new star pays ${STAR_COINS} coins.</p><b class="wallet"><span class="star">★</span>${totalStars()}/${EVENTS.length * 3}</b></div>${tiers}`);
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
    if (r.post > (shot.end === 'sink' ? 1.6 : shot.end === 'water' || shot.end === 'web' || shot.end === 'oob' || shot.end === 'quicksand' ? 1.1 : 0.6)) {
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
    } else if (ev.type === 'launch') ({ cannon: sfx.cannon, seal: sfx.seal, ramp: sfx.whoosh, trampoline: sfx.boing, rocket: sfx.rocket, geyser: sfx.geyser, broom: sfx.broom, sleigh: sfx.sleigh })[ev.by]();
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
  } else if (shot.end === 'web') {
    sfx.web();
    fx.splash = { x: p.x, y: p.y, t: 0, stuck: true };
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

click('btn-courses', () => openCourses());
click('btn-party', openParty);
click('btn-coach-skip', () => { setCoachStep(COACH_STEPS.length); updateCoach(); });
click('btn-intro-ok', () => { sfx.ui(); $('screen-intro').classList.add('hidden'); });
click('btn-intro-alt', () => { $('screen-intro').classList.add('hidden'); startDemo(); });
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
/** A challenge link this page was opened with: friends it's sent to can play without a tester code. */
const incoming = challengeFromUrl(playable());

function testerGate() {
  if (incoming) return;
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
click('btn-more', () => sheet('How to play', `<h3>Shooting</h3><p><b>Pull down</b> anywhere to draw the cue back (further for more power) and drag <b>sideways</b> to fine-tune your aim (hold near the screen edge to keep turning), then <b>release</b> to shoot. To face another way, <b>swipe sideways</b> before pulling down: one swipe across the screen turns you all the way round. The <b>↻</b> button turns you to face straight behind.</p>
  <p>The dotted guide shows your path through the first two banks. It doesn't bend for slopes: the drifting arrows on the turf show which way the ground falls, so aim a little uphill of your target. Water costs a stroke and puts the ball back. Sand slows it down. A hole ends after 10 strokes.</p>
  <p><b>Spin:</b> drag the red dot on the cue-ball pad (above the power bar) to strike off-centre. Left or right swerves the ball and kicks it off walls; top spin rolls on further, backspin bites and pulls back off a wall. Tap the middle to clear it.</p>
  <p>In the <b>whole-table view</b> (the TABLE button), drag anywhere to aim: the ball goes the opposite way to your drag. The <b>↻</b> button swings the view round to the other side of the table.</p>
  <h3>The courses</h3><p>In the <b>Big Top Circus</b>, trampolines bounce the ball over anything in its way (faster in, further out) and cannons fire it across the tent the way the barrel points. Land outside the ring and it's <b>out of bounds</b>: +1 stroke and back to where you hit from.</p>
  <p>In <b>Pharaoh's Tomb</b>, roll into a teal scarab portal to come out of its violet partner; stone doors rise and sink on a timer; and quicksand grips the ball and drags it in: stop in it and it's swallowed (+1 stroke).</p>
  <p>In <b>Candy Land</b>, roll off the open edge of a cake layer to drop to the level below (edges with an icing rim are solid). Roll onto a <b>ladder</b>'s glowing foot to climb up a layer, and into a <b>chute</b>'s swirl to slide down one. Some chutes are shortcuts; some send you back to the start! Chocolate costs a stroke.</p>
  <p>Every course has <b>raised levels</b>. Look for the way up: a geyser in the canyon, a launch rocket on the moon, the cannon or a ladder in the circus, stairs or a portal in the tomb, and a ski lift in the Arctic. Watch out for a toboggan run behind the cup!</p>
  <p><b>Moving platforms</b> (ringed in yellow-and-black stripes) rise and sink on a timer. Roll onto one while it's down, wait for it to carry the ball up, then roll off onto the higher level while it's level.</p>
  <p>On <b>Arctic Peaks</b>, ice is slick, so the ball glides much further; holes in the ice cost a stroke. Roll up to a seal and it flips the ball over the obstacles with its tail. Hit a ski jump fast and straight to fly over walls. Roll into one igloo door to come out of the other.</p>
  <p>Every October, <b>Haunted Hollow</b> 🎃 opens for Halloween: ghosts that are solid only while you can see them, bats, spider webs that catch the ball, green slime, coffins you roll into and out of, pumpkin catapults, and witches whose brooms fly the ball across the hole.</p>
  <p><b>Skull Island</b> 🏴‍☠️ is the expert course, unlocked by earning 36 stars on the six regular courses: narrow planks over the sea, cannonballs raining down, pirates and parrots in the way, quicksand, a kraken guarding its channel, sea caves, ship's cannons, and galleons whose decks rock on the swell, rolling the ball one way and then the other.</p>
  <p>From December 1 to January 6, <b>North Pole Village</b> 🎄 opens for Christmas: presents to bank off, snowmen, marching nutcracker soldiers, rolling snowballs, a frozen pond with holes in the ice, chimneys you drop down and pop out of, a toy train that carries the ball along its track, and Santa's sleigh, which flies it up onto the rooftops.</p>
  <h3>Ways to play</h3><p><b>Vs Computer</b> is match play: you play each hole, then your rival does, and the lower score wins the hole. Beat each rival to unlock the next. Every rival but Rookie Ricky has a coin stake: win the match and it pays back double, lose and it's gone. Under 50 coins? You're topped up to 50 once a day. All square after six holes? A closest-to-the-pin shootout settles it: one shot each, nearest the cup wins.</p>
  <p><b>Stars and treasure:</b> each hole has three stars to earn: ★ for par, ★★ for a birdie, ★★★ for a hole in one. Every hole also hides a spinning <b>golden 8-ball</b>, often up on a higher level or across a hazard: roll through it to collect it. Both pay coins, and the ★ button on the main menu opens the <b>trophy room</b>, where some trophies win designs you can't buy.</p>
  <p><b>Play with friends</b>: 2–4 players share one phone. Everyone plays each hole in turn with their own ball, and the lowest total wins.</p>
  <p><b>Coins from ads</b>: after a round, a match or a daily challenge you can watch a short ad to double the coins you won, and the Cues &amp; Balls shop and Vs Computer screen offer ${AD_COINS} coins for an ad a few times a day. <b>Remove ads</b> in Settings turns off the full-screen ads (halfway through and at the end of a course) for good.</p>
  <p>A new <b>daily challenge</b> appears on the main menu every day: a hole with a goal (par or birdie) or a trick shot. Complete it for bonus coins and keep your 🔥 streak going.</p>
  <p>Every hole earns <b>coins</b>: more for par, birdies, bank shots and holes in one, plus a bonus for finishing a round. Spend them in <b>Cues &amp; Balls</b>; a few designs can only be won.</p>
  <p>Stuck on a hole? Tap the <b>💡</b> in the scorecard for tips on what works best there and what to avoid. It pauses the game while you read.</p>
  <p>The camera sits behind the ball and turns as you aim. Tap <b>TABLE</b> to see the whole hole, and <b>BALL</b> to come back.</p>`));
click('btn-title-sound', toggleMute);
let leaving = false;
click('btn-hole-menu', async () => {
  if (leaving) return;
  leaving = true;
  try { await maybeInterstitial(); } finally { leaving = false; }
  match = null;
  daily = null;
  toTitle();
});
click('btn-next', async () => {
  if (party) { partyNext(); return; }
  // Maybe an ad first: halfway through a course (after hole 3) and when leaving a finished round, match,
  // challenge or practice hole; never between the other holes
  const onward = match ? shootoutPending || holeIdx < LEVELS.length - 1 : !daily && !trick && !practice && holeIdx < LEVELS.length - 1;
  const halfway = onward && !shootoutPending && !daily && !trick && !practice && holeIdx === 2 && LEVELS.length > 3;
  if (!onward || halfway) {
    if (leaving) return;
    leaving = true;
    try { await maybeInterstitial(); } finally { leaving = false; }
  }
  if (match) {
    if (shootoutPending) { startShootout(); return; }
    if (holeIdx === LEVELS.length - 1) { match = null; toTitle(); openVersus(); } else loadHole(holeIdx + 1);
    return;
  }
  if (daily) { daily = null; toTitle(); return; }
  if (trick) { toTitle(); openCareer('tricks'); return; }
  if (careerEvent && holeIdx === LEVELS.length - 1) { toTitle(); openCareer(); return; }
  if (practice) { toTitle(); openCourses(COURSE.id); } else if (holeIdx === LEVELS.length - 1) startRound(); else loadHole(holeIdx + 1);
});
click('set-sound', toggleSound);
click('set-music', toggleMusic);
click('set-vibrate', toggleVibrate);
click('set-guide', toggleGuide);
click('set-follow', toggleFollow);
click('set-arrows', toggleArrows);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); setAudioPaused(document.hidden); });
syncSettingsUi();

// ---------- Loop ----------
let prev = performance.now();
/** Unexpected errors go to the playtest sheet, with where the player was. */
const reportError = watchErrors(() => {
  const at = phase === 'title' ? null : whereIs(world.level);
  const mode = demo ? 'demo' : party ? 'party' : trick ? 'trick' : daily ? 'daily' : careerEvent ? 'career' : match ? 'vs' : practice ? 'practice' : phase === 'title' ? 'menu' : 'round';
  return { course: at?.course ?? (phase === 'title' ? 'menu' : world.level.theme ?? ''), hole: at?.hole ?? 0, name: world.level.name, phase, mode };
});
canvas.addEventListener('webglcontextlost', () => reportError('WebGL context lost'));
// ?testerror in the address sends one test error, to check the playtest sheet's Errors tab is set up
if (new URLSearchParams(location.search).has('testerror')) {
  reportError(`Test error (sent on purpose with ?testerror) ${new Date().toISOString()}`, 'no stack: this is a test');
  setTimeout(() => toast('Test error sent to the playtest sheet', 'good', 3000), 1500);
}

/** Length of one game step (s), and the time not yet stepped. */
const STEP = 1 / 60;
let stepAcc = 0;
function frame(now: number) {
  // One bad frame shouldn't freeze the game: report it and keep going
  try {
    const dt = Math.min(1 / 30, (now - prev) / 1000);
    prev = now;
    lastFrameDt = dt;
    time += dt;

    if (demo) updateDemo(dt);
    // The game runs in fixed steps whatever the screen's refresh rate (60 or 120 Hz), so a shot plays out
    // the same on every phone: challenges and the daily are fair, and the computer's planned shots land
    stepAcc = Math.min(stepAcc + dt, 4 * STEP);
    while (stepAcc >= STEP) {
      stepAcc -= STEP;
      if (phase === 'play' || phase === 'title') tick(STEP);
      // FAST plays the computer's turn at triple speed
      if (phase === 'play' && match && turn === 'ai' && fastAi) for (let k = 0; k < 2 && phase === 'play' && turn === 'ai'; k++) { tick(STEP); stepAi(); }
    }
    if (phase === 'play' && match && turn === 'ai') stepAi();
    if (phase === 'replay' && replay) stepReplay(dt);
    if (phase === 'play') edgeTurn(dt);
    updateCue(phase === 'play' ? dt : 0);
    updateFinger();
    updateCoach();
    fadeScoreCard();
    playMusic(phase === 'title' ? 'menu' : world.level.theme ?? 'candy');
    // Slow motion slows the whole scene, not just the ball
    view3d.render(world, aim, cue, fx, time, phase === 'paused' ? 0 : dt * (replay ? replay.speed : 1));
  } catch (err) {
    const e = err as Error;
    reportError(e?.message ?? String(err), e?.stack);
  }
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
        toast({ jurassic: 'Lava! +1 stroke', space: 'Lost in space! +1 stroke', garden: 'Splash! +1 stroke', circus: 'Splash! +1 stroke', tomb: 'Splash! +1 stroke', arctic: 'Through the ice! +1 stroke', candy: 'Chocolate dip! +1 stroke', halloween: 'Slimed! +1 stroke', christmas: 'Through the ice! +1 stroke', pirate: 'Overboard! +1 stroke' }[world.level.theme ?? 'garden'], 'bad');
        updateHud();
        break;
      case 'launch':
        if (turn === 'player' && !demo) P.noteLaunch(ev.by);
        if (ev.by === 'cannon') { sfx.cannon(); view3d.shake(4); buzz(ImpactStyle.Heavy); toast(world.level.theme === 'halloween' ? 'Pumpkin launch!' : world.level.theme === 'pirate' ? 'Fire!' : 'BOOM!', 'good', 800); }
        else if (ev.by === 'seal') { sfx.seal(); buzz(ImpactStyle.Medium); toast('Flipped!', 'good', 700); }
        else if (ev.by === 'ramp') { sfx.whoosh(); buzz(ImpactStyle.Medium); toast('Airborne!', 'good', 700); }
        else if (ev.by === 'rocket') { sfx.rocket(); view3d.shake(3); buzz(ImpactStyle.Heavy); toast('Blast off!', 'good', 900); }
        else if (ev.by === 'broom') { sfx.broom(); buzz(ImpactStyle.Medium); toast("Hop on! The witch's broom", 'good', 1100); }
        else if (ev.by === 'sleigh') { sfx.sleigh(); buzz(ImpactStyle.Medium); toast("Ho ho ho! Santa's sleigh", 'good', 1100); }
        else if (ev.by === 'geyser') { sfx.geyser(); view3d.shake(2); buzz(ImpactStyle.Heavy); toast('Geyser!', 'good', 900); }
        else { sfx.boing(); buzz(ImpactStyle.Medium); toast('Boing!', 'good', 600); }
        break;
      case 'land':
        sfx.land();
        view3d.bounceBall(700);
        break;
      case 'teleport':
        if (turn === 'player' && !demo) P.bump('portals');
        if (ev.via === 'igloo') sfx.igloo(); else if (world.level.theme === 'halloween') { sfx.creak(); toast('Into the coffin…', 'good', 900); } else if (world.level.theme === 'christmas') { sfx.chimney(); toast('Down the chimney!', 'good', 900); } else if (world.level.theme === 'pirate') { sfx.igloo(); toast('Through the sea cave!', 'good', 900); } else sfx.portal();
        buzz(ImpactStyle.Light);
        break;
      case 'chute': {
        if (turn === 'player' && !demo) P.bump('chutes');
        if (world.level.theme === 'christmas') sfx.train(); else sfx.slide();
        buzz(ImpactStyle.Light);
        // A chute that ends further from the cup than it starts is a snake in the board game
        const c = (world.level.chutes ?? []).find((k) => Math.hypot(b.x - k.path[0][0], b.y - k.path[0][1]) < 30);
        const [cx, cy] = world.level.cup, end = c?.path[c.path.length - 1];
        const back = !!end && Math.hypot(end[0] - cx, end[1] - cy) > Math.hypot(b.x - cx, b.y - cy) + 150;
        const name = world.level.theme === 'arctic' ? 'toboggan' : world.level.theme === 'circus' ? 'slide' : 'chute';
        toast(world.level.theme === 'christmas' ? 'All aboard! Choo choo!' : back ? `Down the ${name}! Back you go` : 'Wheee!', back ? 'bad' : 'good', 1000);
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
      case 'web':
        // Caught in a spider web: a stroke, and back to where it was hit from (the ball stays stuck in view)
        sfx.web();
        if (turn === 'player') sfx.groan();
        buzz(ImpactStyle.Heavy);
        fx.splash = { x: b.x, y: b.y, t: 0, stuck: true };
        strokes++;
        busyTimer = 1.1;
        toast('Caught in a spider web! +1 stroke', 'bad');
        updateHud();
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
    state: () => ({ phase, holeIdx, strokes, ball: { ...world.ball }, moving: world.moving, dt: lastFrameDt, busy: busyTimer, rest: { ...lastRest }, splash: !!fx.splash }),
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
  if (incoming) { clearChallengeUrl(); startChallenge(incoming); } else maybeWelcome();
  initAds();
  void bookReminder(isDoneToday(dailyFor(today())), streak());
  requestAnimationFrame(frame);
}
if (hot?.ready) hot.ready(start); else start(hot?.data ?? {});
