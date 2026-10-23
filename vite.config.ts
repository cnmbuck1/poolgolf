import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Build label shown with playtest feedback: the commit and the date
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'local'; } })();
const BUILD = `${commit} ${new Date().toISOString().slice(0, 10)}`;

// Relative base so the build works inside the Capacitor WebView and on any static host.
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD), __VERSION__: JSON.stringify(process.env.npm_package_version ?? JSON.parse(readFileSync('package.json', 'utf8')).version) },
  build: { target: 'es2020' },
  // three.js add-ons (loaders, post-processing) must share the one copy of three
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/postprocessing/EffectComposer.js', 'three/examples/jsm/postprocessing/RenderPass.js', 'three/examples/jsm/postprocessing/UnrealBloomPass.js', 'three/examples/jsm/postprocessing/OutputPass.js', 'three/examples/jsm/postprocessing/ShaderPass.js'] },
});
