import { defineConfig } from 'vite';

// The browser build lives in web/ and imports the sim core from src/ directly. A relative base
// lets the same build serve from GitHub Pages' /townlet-game/ path or from a domain root.
export default defineConfig({
  root: 'web',
  base: './',
  // three.js goes in its own file: it rarely changes, so returning players keep it cached across deploys.
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined) } },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
