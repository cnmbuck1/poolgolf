import { defineConfig } from 'vite';

// Relative base so the build works inside the Capacitor WebView and on any static host.
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  // three.js add-ons (loaders, post-processing) must share the one copy of three
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three', 'three/examples/jsm/loaders/GLTFLoader.js', 'three/examples/jsm/postprocessing/EffectComposer.js', 'three/examples/jsm/postprocessing/RenderPass.js', 'three/examples/jsm/postprocessing/UnrealBloomPass.js', 'three/examples/jsm/postprocessing/OutputPass.js', 'three/examples/jsm/postprocessing/ShaderPass.js'] },
});
