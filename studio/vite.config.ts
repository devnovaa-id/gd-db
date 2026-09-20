import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/studio/',
  server: {
    proxy: {
      '/studio/api': 'http://localhost:8787',
      '/rest': 'http://localhost:8787',
      '/storage': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
})
