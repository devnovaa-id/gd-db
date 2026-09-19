import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { 'client/index': 'src/client/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outDir: 'dist',
    external: ['googleapis', 'csv-parse', 'csv-stringify'],
    platform: 'neutral',
    target: 'es2022',
  },
  {
    entry: { 'server/index': 'src/server/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    outDir: 'dist',
    external: ['googleapis', 'csv-parse', 'csv-stringify'],
    platform: 'node',
    target: 'es2022',
  },
  {
    entry: { 'handler/index': 'src/handler/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    outDir: 'dist',
    external: ['googleapis', 'csv-parse', 'csv-stringify'],
    platform: 'neutral',
    target: 'es2022',
  },
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    outDir: 'dist',
    external: ['googleapis', 'csv-parse', 'csv-stringify'],
    platform: 'node',
    target: 'es2022',
    banner: { js: '#!/usr/bin/env node' },
  },
])
