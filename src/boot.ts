// Starts the game once saved progress is in place. In the app, every save is also kept in the app's own
// storage (Capacitor Preferences), which iOS doesn't clear the way it can clear a web view's storage, and
// is copied back before the game reads it. On the web this just starts the game.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import '@fontsource/saira-condensed/latin-600.css';
import '@fontsource/saira-condensed/latin-700.css';
import '@fontsource/saira-condensed/latin-800.css';
import '@fontsource/saira/latin-400.css';
import '@fontsource/saira/latin-600.css';
import '@fontsource/saira/latin-800.css';
import '@fontsource/saira/latin-900.css';

const OURS = 'poolgolf.';

async function keepSaves() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { keys } = await Preferences.keys();
    const kept = new Set(keys.filter((k) => k.startsWith(OURS)));
    // Restore anything the web view lost
    for (const k of kept) {
      if (localStorage.getItem(k) != null) continue;
      const { value } = await Preferences.get({ key: k });
      if (value != null) localStorage.setItem(k, value);
    }
    // Copy across anything saved before saves were kept (or while a write was pending)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(OURS) && !kept.has(k)) void Preferences.set({ key: k, value: localStorage.getItem(k)! });
    }
    // From now on, mirror every save
    const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      set.call(this, k, v);
      if (this === localStorage && k.startsWith(OURS)) void Preferences.set({ key: k, value: String(v) });
    };
    Storage.prototype.removeItem = function (this: Storage, k: string) {
      remove.call(this, k);
      if (this === localStorage && k.startsWith(OURS)) void Preferences.remove({ key: k });
    };
  } catch { /* storage unavailable: play on with what's there */ }
}

void keepSaves().finally(() => import('./main'));
