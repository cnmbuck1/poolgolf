// Player analytics (Firebase Analytics, iPhone app only): which holes are played, how they go and where
// players stop, so difficulty and new features can be judged on real play.
//
// Nothing identifies the player: no user ID, no advertising ID (the plugin is built without ad ID support)
// and no ad personalisation signals (Info.plist). It follows Settings → Share anonymous play stats.
// On the web, and in an iPhone build without GoogleService-Info.plist, every call is a harmless no-op;
// calls are fire-and-forget and never block or break the game.
//
// Events (see docs/FIREBASE.md):
//   hole_start      course, hole, label, mode, skill
//   hole_end        course, hole, label, mode, skill, par, strokes, to_par, stars, time_sec, picked_up, banked
//   round_end       course, mode, skill, strokes, to_par
//   daily_end       course, hole, label, strokes, goal_met
//   ad_rewarded     placement, result ('earned' | 'closed' | 'unavailable')
//   ad_interstitial placement
//   remove_ads      result ('done' | 'cancelled' | 'unavailable' | 'failed' | 'restored')
//   skill_change    skill
import { Capacitor } from '@capacitor/core';

type FirebaseApi = typeof import('@capacitor-firebase/analytics').FirebaseAnalytics;
/**
 * The plugin wrapped in a plain object. A Capacitor plugin is a Proxy that answers every property, `then`
 * included, so a promise must never resolve to the plugin itself (it would be taken for a thenable).
 */
type Box = { api: FirebaseApi };
type Params = Record<string, string | number>;

const native = Capacitor.isNativePlatform();
const fb: Promise<Box | null> = native
  ? import('@capacitor-firebase/analytics').then((m) => ({ api: m.FirebaseAnalytics }), () => null)
  : Promise.resolve(null);

/** Log one event. Never throws. */
export function logEvent(name: string, params: Params = {}) {
  void fb.then((b) => b?.api.logEvent({ name, params })).catch(() => {});
}

/** Follow the player's "Share anonymous play stats" choice. */
export function setAnalyticsEnabled(on: boolean) {
  void fb.then((b) => b?.api.setEnabled({ enabled: on })).catch(() => {});
}

/** A user property for slicing reports (e.g. skill level, total stars). */
export function setUserProperty(key: string, value: string) {
  void fb.then((b) => b?.api.setUserProperty({ key, value })).catch(() => {});
}
