import { defineConfig } from 'vite';
import { simVersion } from './src/tools/sim-version.js';

export default defineConfig({
  root: 'web',
  base: './',
  // Which sim made a save, so the loader test can tell a fixture from this build from an older one.
  define: { __SIM_VERSION__: JSON.stringify(simVersion()) },
  // three.js goes in its own file: it rarely changes, so returning players keep it cached across deploys.
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    // The residents' written lines go in a file of their own too (bar round 3: several hundred new lines).
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : /[\\/]src[\\/]content[\\/]/.test(id) ? 'lines' : undefined) } },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
