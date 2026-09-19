# gd-db Agent Guidelines

## Project Overview
gd-db is a Google Drive-backed database library with supabase-js-compatible API, AES-256-GCM encryption, and a Studio dashboard.

## Architecture
- `src/shared/` — shared types and validation (no runtime deps except zod)
- `src/server/` — crypto, CSV, Drive adapters, query/storage engines, token store
- `src/handler/` — serverless request handler, auth routes, session
- `src/client/` — isomorphic client SDK (query builder + storage)
- `src/cli/` — CLI tooling (key generation, init, type gen)
- `studio/` — React + Vite dashboard (Table Editor, Storage Manager, Settings)

## Coding Conventions
- TypeScript strict mode
- Web Crypto API for all cryptographic operations (edge-compatible)
- ESM-first, CJS fallback via tsup
- Server dependencies (googleapis, csv-parse/stringify) must be externalized
- No secrets in client code — master key and OAuth credentials stay server-side only

## Testing
- Vitest with v8 coverage, 80% thresholds
- One test file per source file
- Mock only external dependencies
- Use MockDriveAdapter for offline integration tests
