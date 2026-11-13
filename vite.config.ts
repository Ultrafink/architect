import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative base: works at the domain root and on GitHub Pages (/<repo>/)
  base: './',
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { output: { manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'] } } },
  },
});
