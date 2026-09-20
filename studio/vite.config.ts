import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

// Vite plugin: auto-start gd-db dev server (backend handler)
function gdDbDevServer() {
  let child: any = null
  return {
    name: 'gddb-dev-server',
    configureServer(server: any) {
      child = spawn('node', [resolve(projectRoot, 'scripts/dev-server.mjs')], {
        cwd: projectRoot,
        stdio: ['ignore', 'inherit', 'inherit'],
      })
      child.on('error', (err: any) => console.error('gd-db dev server error:', err))
      server.httpServer.on('close', () => { if (child) child.kill() })
      process.on('exit', () => { if (child) child.kill() })
    },
  }
}

export default defineConfig({
  plugins: [react(), gdDbDevServer()],
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
