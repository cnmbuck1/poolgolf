import { defineConfig } from 'vite';

// Relative base so the build works inside the Capacitor WebView and on any static host.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
