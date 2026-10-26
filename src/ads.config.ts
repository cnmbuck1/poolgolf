// Ads and the Remove ads purchase. See docs/ADS.md for the setup in AdMob and App Store Connect.
//
// Until the real AdMob IDs are pasted in, these are Google's demo units, which always show test ads (safe to
// tap; they earn nothing). When you switch to your own IDs, also change GADApplicationIdentifier in
// ios/App/App/Info.plist to your AdMob app ID, and set ADS_TESTING to false.

/** Show test ads only. Leave true until the real ad unit IDs below are in place. */
export const ADS_TESTING = true;

/** AdMob ad unit IDs (iOS). */
export const AD_UNITS = {
  interstitial: 'ca-app-pub-3940256099942544/4411468910',
  rewarded: 'ca-app-pub-3940256099942544/1712485313',
};

/** The Remove ads in-app purchase (a non-consumable product with this ID in App Store Connect). */
export const REMOVE_ADS_ID = 'com.cnmbuckstudios.rackandroll.removeads';
/** Shown until the App Store's own (local) price has loaded. */
export const REMOVE_ADS_PRICE = '$2.99';

/** Between-round ads: at most one this often, and none in a player's first few app launches. */
export const INTERSTITIAL_GAP_S = 210;
export const INTERSTITIAL_FROM_SESSION = 4;

/** Coins for watching an ad from the shop or the Vs Computer screen, and how many of those a day. */
export const AD_COINS = 50;
export const AD_COINS_PER_DAY = 5;
