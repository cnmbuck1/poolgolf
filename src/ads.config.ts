// Ads and the Remove ads purchase. See docs/ADS.md for the setup in AdMob and App Store Connect.
//
// The AdMob app (ca-app-pub-8965676427575286~1645510652) is set in ios/App/App/Info.plist. Copies installed
// from TestFlight always get test ads (safe to tap; they earn nothing); App Store downloads get real ones.

/** Test ads everywhere, App Store copies included (for emergencies: TestFlight copies get them regardless). */
export const ADS_TESTING = false;

/** AdMob ad unit IDs (iOS). */
export const AD_UNITS = {
  interstitial: 'ca-app-pub-8965676427575286/5393183974', // Between rounds
  rewarded: 'ca-app-pub-8965676427575286/1979010584', // Rewarded coins
};

/**
 * AdMob ad unit IDs (Android): Google's sample units until the Android app is set up in AdMob (its app ID goes
 * in android/app/src/main/AndroidManifest.xml). Android builds get test ads unless they're built for the Play
 * Store's production track (the "Android build" workflow sets VITE_REAL_ADS for those).
 */
export const AD_UNITS_ANDROID = {
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

/** The Remove ads in-app purchase (a non-consumable product with this ID in App Store Connect). */
export const REMOVE_ADS_ID = 'com.cnmbuckstudios.racknroll.removeads';
/** Shown until the App Store's own (local) price has loaded. */
export const REMOVE_ADS_PRICE = '$2.99';

/** Full-screen ads (after hole 3 of a course, and at the end): at most one this often, and none in a player's first few app launches. */
export const INTERSTITIAL_GAP_S = 60;
export const INTERSTITIAL_FROM_SESSION = 4;

/** Coins for watching an ad from the shop or the Vs Computer screen, and how many of those a day. */
export const AD_COINS = 50;
export const AD_COINS_PER_DAY = 5;
