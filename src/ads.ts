// Ads (AdMob) and the Remove ads purchase, in the app only.
//
// - Rewarded ads are always the player's choice: double a round's coins, or coins for the shop.
// - A full-screen ad may show halfway through a course (after hole 3) and at the end, at most every couple of
//   minutes and not in a player's first few launches. Remove ads turns those off for good; rewarded ads stay available.
// - Consent: Google's form where the law asks for it (EU/UK), then Apple's tracking question. A player
//   who says no still sees ads, just less personalised ones.
//
// On the web there are no ads; `?fakeads` shows stand-in ads so the flow can be tried in a browser.
import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { AD_COINS_PER_DAY, AD_UNITS, ADS_TESTING, INTERSTITIAL_FROM_SESSION, INTERSTITIAL_GAP_S, REMOVE_ADS_ID, REMOVE_ADS_PRICE } from './ads.config';
import { setAudioPaused } from './audio';

const native = Capacitor.isNativePlatform();
const fake = (() => { try { return new URLSearchParams(location.search).has('fakeads') || localStorage.getItem('poolgolf.fakeads') === '1'; } catch { return false; } })();
const get = (k: string) => { try { return localStorage.getItem(`poolgolf.${k}`); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(`poolgolf.${k}`, v); } catch { /* ignore */ } };

/** Whether this build shows ads at all (the app, or the browser stand-ins). */
export const adsAvailable = native || fake;
/** Whether the Remove ads purchase can be offered here. */
export const canPurchase = native || fake;
/** The player bought Remove ads (kept in saves, and re-checked with the App Store at launch). */
export const adsRemoved = () => get('noads') === '1';

// App launches, so a new player gets a few sessions without any full-screen ads
const session = Number(get('sessions') ?? 0) + 1;
set('sessions', String(session));
let lastAd = performance.now(); // counts from launch, so the first can't come straight away

// ---------- AdMob ----------

let ready: Promise<boolean> | null = null;
let interstitialLoaded = false, rewardedLoaded = false;

/** Consent, tracking question and SDK start, once; true when ads may be requested. */
function start() {
  if (!native) return Promise.resolve(fake);
  ready ??= (async () => {
    try {
      let info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) info = await AdMob.showConsentForm();
      if (!info.canRequestAds) return false;
      const t = await AdMob.trackingAuthorizationStatus();
      if (t.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      await AdMob.initialize({ initializeForTesting: ADS_TESTING });
      void loadRewarded();
      if (!adsRemoved()) void loadInterstitial();
      return true;
    } catch { ready = null; return false; }
  })();
  return ready;
}

async function loadInterstitial() {
  try { await AdMob.prepareInterstitial({ adId: AD_UNITS.interstitial, isTesting: ADS_TESTING }); interstitialLoaded = true; } catch { interstitialLoaded = false; }
}
async function loadRewarded() {
  try { await AdMob.prepareRewardVideoAd({ adId: AD_UNITS.rewarded, isTesting: ADS_TESTING }); rewardedLoaded = true; } catch { rewardedLoaded = false; }
}

/**
 * Start ads early for returning players (the consent and tracking questions come on a later launch, not the
 * very first, when the player has just opened the game). New players are asked when they first tap a
 * rewarded ad, or on their second launch.
 */
export function initAds() {
  if (native && session >= 2) setTimeout(() => void start(), 4000);
  if (native) void checkPurchase();
}

/**
 * Show a prepared full-screen ad and wait for it to close. The plugin's own call settles early (when the ad
 * appears, or when the reward is earned) or never (closed before the reward), so this goes by its events.
 * Resolves whether the reward was earned (always false for an interstitial).
 */
async function present(kind: 'rewarded' | 'interstitial') {
  const ev = kind === 'rewarded'
    ? { dismissed: RewardAdPluginEvents.Dismissed, failed: RewardAdPluginEvents.FailedToShow }
    : { dismissed: InterstitialAdPluginEvents.Dismissed, failed: InterstitialAdPluginEvents.FailedToShow };
  let earned = false;
  const handles = [];
  const closed = new Promise<void>((resolve) => {
    handles.push(AdMob.addListener(ev.dismissed as never, () => resolve()));
    handles.push(AdMob.addListener(ev.failed as never, () => resolve()));
  });
  if (kind === 'rewarded') handles.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }));
  setAudioPaused(true);
  try {
    const shown = kind === 'rewarded' ? AdMob.showRewardVideoAd().then(() => { earned = true; }) : AdMob.showInterstitial();
    // A refusal to show at all ends it straight away; otherwise wait for the ad to be closed
    await Promise.race([closed, shown.then(() => closed, () => undefined)]);
  } catch { /* not shown */ } finally {
    setAudioPaused(false);
    lastAd = performance.now();
    for (const h of handles) void (await h).remove();
  }
  return earned;
}

/** A stand-in full-screen ad for trying the flow in a browser. */
function fakeAd(label: string, seconds: number) {
  return new Promise<boolean>((resolve) => {
    const el = document.createElement('div');
    el.className = 'fake-ad';
    el.innerHTML = `<div><b>${label}</b><p>Test ad · <span>${seconds}</span>s</p><button class="btn">Close</button></div>`;
    document.body.append(el);
    let left = seconds;
    const tick = setInterval(() => { left--; el.querySelector('span')!.textContent = String(Math.max(0, left)); }, 1000);
    el.querySelector('button')!.onclick = () => { clearInterval(tick); el.remove(); resolve(left <= 0); };
  });
}

/**
 * A rewarded ad the player asked for. Resolves true if they watched it through (grant the reward then),
 * false if it wasn't available or they closed it early.
 */
export async function showRewarded(): Promise<boolean> {
  if (fake && !native) { const ok = await fakeAd('Rewarded ad', 3); lastAd = performance.now(); return ok; }
  if (!(await start())) return false;
  if (!rewardedLoaded) await loadRewarded();
  if (!rewardedLoaded) return false;
  rewardedLoaded = false;
  const earned = await present('rewarded');
  void loadRewarded();
  return earned;
}

/** Halfway through a course or at the end: maybe a full-screen ad (see the rules at the top). Resolves when it's closed. */
export async function maybeInterstitial() {
  if (!adsAvailable || adsRemoved() || session < INTERSTITIAL_FROM_SESSION) return;
  if (performance.now() - lastAd < INTERSTITIAL_GAP_S * 1000) return;
  if (fake && !native) { await fakeAd('Full-screen ad', 2); lastAd = performance.now(); return; }
  if (!(await start()) || !interstitialLoaded) { void loadInterstitial(); return; }
  interstitialLoaded = false;
  await present('interstitial');
  void loadInterstitial();
}

/** Coin ads watched today, against the daily limit. */
export function coinAdsLeft(day: number) {
  return get('adcoins.day') === String(day) ? Math.max(0, AD_COINS_PER_DAY - Number(get('adcoins.n') ?? 0)) : AD_COINS_PER_DAY;
}
export function noteCoinAd(day: number) {
  const n = get('adcoins.day') === String(day) ? Number(get('adcoins.n') ?? 0) : 0;
  set('adcoins.day', String(day)); set('adcoins.n', String(n + 1));
}

/** Google's privacy choices form (for players in places where consent is asked). */
export async function privacyChoices() {
  if (!native) return;
  try { await start(); await AdMob.showPrivacyOptionsForm(); } catch { /* not needed here */ }
}

// ---------- Remove ads ----------

/** The local price from the App Store, once known. */
export async function removeAdsPrice() {
  if (!native) return REMOVE_ADS_PRICE;
  try {
    const { products } = await NativePurchases.getProducts({ productIdentifiers: [REMOVE_ADS_ID], productType: PURCHASE_TYPE.INAPP });
    return products[0]?.priceString ?? REMOVE_ADS_PRICE;
  } catch { return REMOVE_ADS_PRICE; }
}

/** Buy Remove ads. 'done' when bought, 'cancelled' if the player backed out, 'failed' otherwise. */
export async function buyRemoveAds(): Promise<'done' | 'cancelled' | 'failed'> {
  if (fake && !native) { set('noads', '1'); return 'done'; }
  try {
    const t = await NativePurchases.purchaseProduct({ productIdentifier: REMOVE_ADS_ID, productType: PURCHASE_TYPE.INAPP });
    if (t?.productIdentifier === REMOVE_ADS_ID || t?.transactionId) { set('noads', '1'); return 'done'; }
    return 'failed';
  } catch (e) {
    return /cancel/i.test(String((e as Error)?.message ?? e)) ? 'cancelled' : 'failed';
  }
}

/** Ask the App Store whether Remove ads was bought on this Apple ID (a new phone, or a reinstall). */
async function checkPurchase() {
  try {
    const { purchases } = await NativePurchases.getPurchases({ onlyCurrentEntitlements: true });
    if (purchases.some((p) => p.productIdentifier === REMOVE_ADS_ID)) set('noads', '1');
    return adsRemoved();
  } catch { return adsRemoved(); }
}

/** Restore purchases (Settings): true if Remove ads came back. */
export async function restorePurchases() {
  if (!native) return adsRemoved();
  try { await NativePurchases.restorePurchases(); } catch { /* fall through to the check */ }
  return checkPurchase();
}
