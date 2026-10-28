// Ads and the Remove ads purchase. See docs/ADS.md for the setup in AdMob and App Store Connect.
//
// The AdMob app (ca-app-pub-8965676427575286~1645510652) is set in ios/App/App/Info.plist. Until the real ad
// unit IDs are pasted in below, these are Google's demo units, which always show test ads (safe to tap; they
// earn nothing) and work with any app ID. With the real units in, set ADS_TESTING to false.

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

/** Full-screen ads (after hole 3 of a course, and at the end): at most one this often, and none in a player's first few app launches. */
export const INTERSTITIAL_GAP_S = 60;
export const INTERSTITIAL_FROM_SESSION = 4;

/** Coins for watching an ad from the shop or the Vs Computer screen, and how many of those a day. */
export const AD_COINS = 50;
export const AD_COINS_PER_DAY = 5;
