# gd-db

Open-source, free Google Drive-backed database with a supabase-js-compatible API, AES-256-GCM envelope encryption, and a bundled Studio dashboard.

**By thiskey (DevNova-ID — DreamToRealiityCreative)**

gd-db turns Google Drive into a database: CSV files for tables, folders for file storage — all encrypted at rest. Use it for free database hosting without paying for a managed DB.

## Features

- **Supabase-compatible API** — `.from().select().eq().insert().update().delete().upsert()` + `.storage`
- **End-to-rest encryption** — AES-256-GCM envelope encryption (SSE-KMS pattern); Google never sees plaintext
- **Google Drive storage** — tables as encrypted CSV, files as encrypted blobs
- **Studio dashboard** — web UI at `/studio` for managing tables, storage, and Drive connection
- **OAuth web auth** — connect Drive with one click, no Service Account JSON needed
- **Isomorphic** — works in React, Next.js, Node.js, and browsers

## Quick Start

### 1. Install

```bash
npm install gd-db
```

### 2. Define your schema

```ts
// gddb.config.ts
import { defineSchema } from 'gd-db/server'

export default defineSchema({
  tables: {
    users: { columns: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'text' },
      created_at: { type: 'timestamptz', default: 'now()' },
    } },
  },
  storage: { buckets: { avatars: { public: true } } },
})
```

### 3. Deploy the handler (Vercel/Cloudflare/Netlify)

```ts
// api/gddb.ts
import { createHandler, EnvTokenStore } from 'gd-db/handler'
import schema from '../gddb.config'

export default createHandler({
  schema,
  anonKey: process.env.GDDB_ANON_KEY!,
  masterKey: process.env.GDDB_MASTER_KEY!,
  dashboardPassword: process.env.GDDB_DASHBOARD_PASSWORD!,
  clientId: process.env.GDDB_CLIENT_ID!,
  clientSecret: process.env.GDDB_CLIENT_SECRET!,
  redirectUri: process.env.GDDB_REDIRECT_URI!,
  tokenStore: new EnvTokenStore(process.env.GDDB_TOKEN),
})
```

### 4. Generate a master key

```bash
npx gddb keys generate
```

### 5. Connect Google Drive (zero setup)

Open `{your-deploy-url}/studio`, login with your dashboard password, and click **Connect Google Drive**.

That's it — no Google Cloud Console setup needed. gd-db uses a community OAuth relay to handle the Google authorization automatically. Just click, authorize, done.

> **Advanced:** If you prefer to use your own OAuth credentials instead of the relay, set `GDDB_CLIENT_ID`, `GDDB_CLIENT_SECRET`, and `GDDB_REDIRECT_URI` in your environment. See `.env.example`.

### 6. Use the client

```ts
import { createClient } from 'gd-db'

const gdb = createClient('https://your-deploy-url', 'your-anon-key')

// Query
const { data } = await gdb.from('users').select('*').eq('name', 'Alice')

// Insert
await gdb.from('users').insert({ id: crypto.randomUUID(), name: 'Bob' })

// Storage
await gdb.storage.from('avatars').upload('me.png', file)
const blob = await gdb.storage.from('avatars').download('me.png')
```

## Security

- **AES-256-GCM** authenticated encryption on every file in Drive
- **Envelope encryption** (SSE-KMS pattern): master key wraps per-file data keys
- Master key lives only in server environment variables
- OAuth refresh tokens encrypted at rest
- HTTPS required for all transit

## Column Types

| Type | Description |
|------|-------------|
| `uuid` | UUID string |
| `text` | Text string |
| `number` | Numeric value |
| `bool` | Boolean (true/false) |
| `timestamptz` | ISO timestamp |

## License

MIT
