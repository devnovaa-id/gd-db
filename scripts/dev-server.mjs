// gd-db dev server — runs the handler backend for local Studio development
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

// --- Load .env ---
function loadEnv() {
  const envPath = join(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    console.log('⚠️  No .env found. Run "npx gddb setup" first. Using defaults.')
    return
  }
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

// --- Default schema for dev mode ---
const defaultSchema = {
  tables: {
    users: { columns: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'text' },
      email: { type: 'text' },
      created_at: { type: 'timestamptz', default: 'now()' },
    } },
  },
  storage: { buckets: { avatars: { public: true } } },
}

let schema = defaultSchema

// --- Generate keys if missing ---
const masterKey = process.env.GDDB_MASTER_KEY || randomBytes(32).toString('base64')
const anonKey = process.env.GDDB_ANON_KEY || randomBytes(32).toString('base64url')
const dashboardPassword = process.env.GDDB_DASHBOARD_PASSWORD || ''

if (!dashboardPassword) {
  console.log('⚠️  GDDB_DASHBOARD_PASSWORD not set — login will fail!')
  console.log('   Set it in .env: GDDB_DASHBOARD_PASSWORD=your-password')
}

// --- Create handler ---
const { createHandler } = await import('../dist/handler/index.js')
const { MockDriveAdapter } = await import('../dist/server/index.js')

const drive = new MockDriveAdapter()
const root = await drive.createFolder('root', 'gd-db')
await drive.createFolder(root.id, 'tables')
await drive.createFolder(root.id, 'storage')

const handler = createHandler({
  schema,
  anonKey,
  masterKey,
  dashboardPassword,
  drive,
  rootFolderId: root.id,
  relayUrl: process.env.GDDB_RELAY_URL || 'https://gd-db.devnova.workers.dev',
})

// --- Start HTTP server ---
const PORT = Number(process.env.GDDB_DEV_PORT) || 8787

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      headers.set(k, Array.isArray(v) ? v[0] : v ?? '')
    }
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await readBody(req) : undefined
    const request = new Request(url, { method: req.method, headers, body })
    const response = await handler(request)
    const respHeaders = {}
    response.headers.forEach((v, k) => { respHeaders[k] = v })
    res.writeHead(response.status, respHeaders)
    if (response.body) {
      const buf = Buffer.from(await response.arrayBuffer())
      res.end(buf)
    } else {
      res.end()
    }
  } catch (e) {
    console.error('Handler error:', e)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: e.message }))
  }
})

server.listen(PORT, () => {
  console.log(`\n🚀 gd-db dev server running at http://localhost:${PORT}`)
  console.log(`   Studio:  http://localhost:3000/studio/ (Vite proxy)`)
  console.log(`   API:     http://localhost:${PORT}/rest/v1/`)
  console.log(`   Drive:   MockDriveAdapter (dev mode)`)
  console.log(`   Schema:  ${Object.keys(schema.tables).join(', ')}`)
  console.log(`   Password: ${dashboardPassword ? '✓ set' : '⚠️  NOT SET'}\n`)
})
