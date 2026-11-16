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
};

export default config;
