// Coins and unlocks for the Cues & Balls menu. Saved on this device only (a store build would move
// this to an account so purchases can be restored).
import { BALLS, CUES } from './gear';

const key = (k: string) => `poolgolf.${k}`;
function get(k: string) { try { return localStorage.getItem(key(k)); } catch { return null; } }
function set(k: string, v: string) { try { localStorage.setItem(key(k), v); } catch { /* ignore */ } }

/** Coins a new player starts with: enough for a first cheap design straight away. */
const STARTING_COINS = 150;

/** Item keys: `b:<ball id>` or `c:<cue id>`. */
export type ItemKey = `b:${string}` | `c:${string}`;

/** Designs that can't be bought, only earned. */
export const ACHIEVEMENTS = {
  ace: { item: 'b:gold' as ItemKey, label: 'Make a hole in one' },
  underPar: { item: 'c:eagle' as ItemKey, label: 'Finish a round under par' },
  lunar: { item: 'b:galaxy' as ItemKey, label: 'Finish a round of Lunar Links' },
};
export type Achievement = keyof typeof ACHIEVEMENTS;

let owned = new Set<string>(JSON.parse(get('owned') ?? 'null') ?? []);
if (!get('owned')) {
  // First run of the wallet: the defaults, plus whatever was picked back when everything was free
  owned = new Set(['b:cue', 'c:classic', `b:${get('ball') ?? 'cue'}`, `c:${get('cue') ?? 'classic'}`]);
  set('owned', JSON.stringify([...owned]));
  if (get('coins') == null) set('coins', String(STARTING_COINS));
}

export const coins = () => Number(get('coins') ?? STARTING_COINS);
export function addCoins(n: number) { set('coins', String(coins() + n)); }
export const isOwned = (k: ItemKey) => owned.has(k);
function own(k: ItemKey) { owned.add(k); set('owned', JSON.stringify([...owned])); }

/** Price and how to unlock an item. */
export function itemInfo(k: ItemKey) {
  const [kind, id] = [k[0], k.slice(2)];
  const d = kind === 'b' ? BALLS.find((b) => b.id === id) : CUES.find((c) => c.id === id);
  const ach = (Object.keys(ACHIEVEMENTS) as Achievement[]).find((a) => ACHIEVEMENTS[a].item === k);
  return { name: d?.name ?? id, price: d?.price ?? 0, achievement: ach ? ACHIEVEMENTS[ach].label : null };
}

/** Spend coins on an item; false if it can't be bought or there aren't enough coins. */
export function buy(k: ItemKey) {
  const { price, achievement } = itemInfo(k);
  if (isOwned(k) || achievement || coins() < price) return false;
  addCoins(-price);
  own(k);
  return true;
}

/** Unlock an achievement's design; returns its name (e.g. "Gold ball") the first time, null after that. */
export function earn(a: Achievement) {
  const k = ACHIEVEMENTS[a].item;
  if (isOwned(k)) return null;
  own(k);
  return `${itemInfo(k).name} ${k[0] === 'b' ? 'ball' : 'cue'}`;
}

/** Coins for finishing a hole, itemised for the results screen. */
export function holeReward(score: number, par: number, banked: boolean) {
  const lines: [string, number][] = [['Hole', 5]];
  if (score === 1) lines.push(['Hole in one', 100]);
  else if (score <= par - 2) lines.push(['Eagle', 50]);
  else if (score === par - 1) lines.push(['Birdie', 25]);
  else if (score === par) lines.push(['Par', 10]);
  if (banked) lines.push(['Bank shot', 10]);
  return lines;
}

/** Coins for finishing a round. */
export function roundReward(toPar: number) {
  const lines: [string, number][] = [['Round', 50]];
  if (toPar < 0) lines.push(['Under par', 100]);
  return lines;
}
