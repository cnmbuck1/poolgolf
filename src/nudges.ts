// Two gentle nudges, in the app only: Apple's "rate this game" prompt after a happy moment, and an opt-in
// reminder when a new daily challenge is waiting.
import { Capacitor } from '@capacitor/core';
import { InAppReview } from '@capacitor-community/in-app-review';
import { LocalNotifications } from '@capacitor/local-notifications';

const native = Capacitor.isNativePlatform();
const get = (k: string) => { try { return localStorage.getItem(`poolgolf.${k}`); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(`poolgolf.${k}`, v); } catch { /* ignore */ } };

// ---------- Rate the game ----------

/**
 * After something good (a round at par or better, a hole in one, a match won): ask for a rating, but only
 * once the player has a few rounds behind them, and at most every 60 days. Apple shows the prompt at most
 * three times a year whatever we ask, and never in TestFlight.
 */
export function maybeAskForRating(rounds: number) {
  if (!native || rounds < 3 || Number(get('sessions') ?? 0) < 3) return;
  const last = Number(get('rated.at') ?? 0);
  if (Date.now() - last < 60 * 86400000) return;
  set('rated.at', String(Date.now()));
  setTimeout(() => void InAppReview.requestReview().catch(() => {}), 1500);
}

// ---------- Daily challenge reminder ----------

const REMINDER_ID = 1;
const REMINDER_HOUR = 18;
export const canRemind = native;
export const remindersOn = () => get('remind') === '1';

/**
 * Keep one reminder booked: 6 pm today if today's challenge isn't done and it's not 6 yet, otherwise 6 pm
 * tomorrow. Called at launch and after each daily challenge.
 */
export async function bookReminder(doneToday: boolean, streak: number) {
  if (!native || !remindersOn()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    const at = new Date();
    if (doneToday || at.getHours() >= REMINDER_HOUR) at.setDate(at.getDate() + 1);
    at.setHours(REMINDER_HOUR, 0, 0, 0);
    await LocalNotifications.schedule({ notifications: [{
      id: REMINDER_ID,
      title: 'Rack & Roll',
      body: streak > 0 ? `Today's daily challenge is ready. Keep your ${streak}-day streak going! 🔥` : "Today's daily challenge is ready. Can you make the goal?",
      schedule: { at, allowWhileIdle: true },
    }] });
  } catch { /* notifications unavailable */ }
}

/** Turn the reminder on (asking iOS for permission) or off. Resolves whether it's on. */
export async function setReminders(on: boolean, doneToday: boolean, streak: number) {
  if (!native) return false;
  if (!on) {
    set('remind', '0');
    try { await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] }); } catch { /* ignore */ }
    return false;
  }
  try {
    const p = await LocalNotifications.requestPermissions();
    if (p.display !== 'granted') { set('remind', '0'); return false; }
  } catch { return false; }
  set('remind', '1');
  await bookReminder(doneToday, streak);
  return true;
}
