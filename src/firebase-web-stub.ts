/**
 * Stand-in for the Firebase JS SDK ('firebase/analytics'). The Firebase Analytics plugin ships a web
 * implementation that imports it, but Rack & Roll only logs analytics in the iPhone app (the native SDK),
 * so the JS SDK isn't installed. Vite aliases 'firebase/analytics' here (vite.config.ts).
 */
const unavailable = (): never => {
  throw new Error('Firebase web analytics is not included in Rack & Roll');
};
export const getAnalytics = unavailable;
export const logEvent = unavailable;
export const setAnalyticsCollectionEnabled = unavailable;
export const setConsent = unavailable;
export const setUserId = unavailable;
export const setUserProperties = unavailable;
