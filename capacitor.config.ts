import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cnmbuckstudios.rackandroll',
  appName: 'Rack & Roll',
  webDir: 'dist',
  backgroundColor: '#101b29',
  ios: { contentInset: 'never' },
  // The launch image stays up until the title screen has drawn (main.ts hides it), so there's no blank
  // screen between it and the game
  plugins: { SplashScreen: { launchAutoHide: false, backgroundColor: '#101b29', showSpinner: false } },
  experimental: {
    ios: {
      spm: {
        // Package traits need Swift tools 6.1 (Xcode 16.3+; the TestFlight workflow uses Xcode 26).
        swiftToolsVersion: '6.1',
        // Firebase Analytics without the advertising ID: play stats only, never used for tracking.
        packageTraits: { '@capacitor-firebase/analytics': ['AnalyticsWithoutAdIdSupport'] },
      },
    },
  },
};

export default config;
