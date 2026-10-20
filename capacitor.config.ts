import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Change this to a reverse-domain ID you own before submitting to the stores.
  appId: 'com.example.poolgolf',
  appName: 'Pool Golf',
  webDir: 'dist',
  backgroundColor: '#101b29',
  ios: { contentInset: 'never' },
};

export default config;
