import { importMasterKey, decryptBytes, encryptBytes } from '../server/crypto.js'
import type { MasterKey } from '../server/crypto.js'
import { QueryEngine } from '../server/query-engine.js'
import { StorageEngine } from '../server/storage.js'
import { GoogleDriveAdapter } from '../server/google-drive.js'
import type { DriveAdapter } from '../server/drive-adapter.js'
import type { HandlerConfig } from './types.js'
import { encodeSessionToken, verifySessionToken, resolveHandlerUrl } from './session.js'

export function createHandler(config: HandlerConfig): (req: Request) => Promise<Response> {
  let masterKey: MasterKey | null = null
  let queryEngine: QueryEngine | null = null
  let storageEngine: StorageEngine | null = null
  let drive: DriveAdapter | null = null
  let initialized = false

  async function init() {
    if (initialized) return
    masterKey = await importMasterKey(config.masterKey)
    drive = config.drive ?? null
    initialized = true
  }

  async function lazyEngines(): Promise<void> {
    await init()
    if (queryEngine && storageEngine) return
    if (!drive) {
      if (!config.clientId || !config.clientSecret) throw new Error('GDDB: drive or OAuth credentials required')
      const token = await config.tokenStore?.get()
      if (!token) throw new Error('GDDB: not connected to Google Drive. Use the Studio dashboard or /auth to connect.')
      const plain = await decryptToken(token.refreshTokenCipher, masterKey!)
      drive = new GoogleDriveAdapter({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: plain })
    }
    const token = await config.tokenStore?.get()
    const rootFolderId = config.rootFolderId ?? token?.rootFolderId ?? ''
    if (!rootFolderId) throw new Error('GDDB: root folder not initialized')
    const tablesFolder = await drive.findByName(rootFolderId, 'tables') ?? await drive.createFolder(rootFolderId, 'tables')
    const storageFolder = await drive.findByName(rootFolderId, 'storage') ?? await drive.createFolder(rootFolderId, 'storage')
    queryEngine = new QueryEngine(config.schema, drive, tablesFolder.id, masterKey!)
    storageEngine = new StorageEngine(config.schema, drive, storageFolder.id, masterKey!)
  }

  return async (req: Request): Promise<Response> => {
    await init()
    const url = new URL(req.url)
    const path = url.pathname
    const handlerUrl = resolveHandlerUrl(req)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // Studio routes
    if (path === '/studio' || path.startsWith('/studio/')) {
      if (path === '/studio/api/login' && req.method === 'POST') return studioLogin(req, config)
      if (path === '/studio/api/status' && req.method === 'GET') return studioStatus(config)
      if (path === '/studio/api/connect' && req.method === 'POST') return studioConnect(config, handlerUrl)
      if (path === '/studio/api/auth/callback' && req.method === 'GET') return studioAuthCallback(url, config, handlerUrl)
      if (path === '/studio/api/auth/pair' && req.method === 'POST') return relayPair(config, handlerUrl)
      if (path === '/studio/api/auth/complete' && req.method === 'GET') return relayComplete(url, config, handlerUrl)
      if (path.startsWith('/studio/api/')) {
        const sessionErr = await checkSession(req, config)
        if (sessionErr) return sessionErr
        return studioAdminRoute(path, req, url, config)
      }
      return serveStudioAsset(path)
    }

    // Auth routes
    if (path === '/auth' && req.method === 'GET') {
      const code = url.searchParams.get('code')
      if (code) return authCallback(code, config, handlerUrl)
      return authLogin(config, handlerUrl)
    }

    // REST API: /rest/v1/:table
    if (path.startsWith('/rest/v1/')) {
      const tableName = path.slice('/rest/v1/'.length).split('/')[0]
      if (!tableName) return json({ error: 'table required' }, 400)
      const authError = checkAnonKey(req, config.anonKey)
      if (authError) return authError
      try {
        await lazyEngines()
        const body = await req.json() as any
        const result = await queryEngine!.execute(body)
        return json({ data: result.data, error: null, count: result.count })
      } catch (e) {
        return json({ data: null, error: { message: (e as Error).message }, count: null }, 200)
      }
    }

    // Storage API: /storage/v1/...
    if (path.startsWith('/storage/v1/')) {
      const authError = checkAnonKey(req, config.anonKey)
      if (authError) return authError
      return storageRoute(path, req, url, config)
    }

    return json({ name: 'gd-db', version: '0.1.0' })
  }
}

// --- Auth helpers ---

async function authLogin(config: HandlerConfig, handlerUrl: string): Promise<Response> {
  if (!config.clientId || !config.redirectUri) return json({ error: 'OAuth not configured' }, 500)
  return json({ url: buildAuthUrl(config.clientId, config.redirectUri) })
}

async function authCallback(code: string, config: HandlerConfig, handlerUrl: string): Promise<Response> {
  if (!config.clientId || !config.clientSecret || !config.redirectUri) return json({ error: 'OAuth not configured' }, 500)
  try {
    const mk = await importMasterKey(config.masterKey)
    const tokens = await exchangeCode(config.clientId, config.clientSecret, code, config.redirectUri)
    if (!tokens.refresh_token) throw new Error('No refresh_token received')
    await storeRefreshToken(tokens.refresh_token, config, mk)
    return redirect("/studio?connected=1")
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
}

function getRelayUrl(config: HandlerConfig): string {
  return config.relayUrl ?? process?.env?.GDDB_RELAY_URL ?? 'https://gd-db.devnova.workers.dev'
}

async function studioConnect(config: HandlerConfig, handlerUrl: string): Promise<Response> {
  // Direct OAuth if credentials are set
  if (config.clientId && config.redirectUri) {
    return json({ url: buildAuthUrl(config.clientId, config.redirectUri) })
  }
  // Relay flow (zero setup)
  return relayPair(config, handlerUrl)
}

// --- One-time code store for relay flow ---
const otcStore = new Map<string, { expiry: number }>()

async function relayPair(config: HandlerConfig, handlerUrl: string): Promise<Response> {
  const otc = generateOtc()
  const ttlMs = 5 * 60 * 1000
  otcStore.set(otc, { expiry: Date.now() + ttlMs })
  // Clean expired entries
  for (const [k, v] of otcStore) if (v.expiry < Date.now()) otcStore.delete(k)
  const relayUrl = getRelayUrl(config)
  const returnUrl = `${handlerUrl}/studio/api/auth/complete`
  const connectUrl = `${relayUrl}/connect?return_url=${encodeURIComponent(returnUrl)}&state=${otc}`
  return json({ url: connectUrl })
}

async function relayComplete(url: URL, config: HandlerConfig, handlerUrl: string): Promise<Response> {
  const token = url.searchParams.get('token')
  const state = url.searchParams.get('state')
  if (!token || !state) return redirect("/studio?connected=0&error=missing_params")
  const entry = otcStore.get(state)
  otcStore.delete(state)
  if (!entry || entry.expiry < Date.now()) {
    const relayUrl = getRelayUrl(config)
    return redirect(`${relayUrl}/error?message=invalid_or_expired_code`)
  }
  try {
    const mk = await importMasterKey(config.masterKey)
    await storeRefreshToken(token, config, mk)
    return redirect("/studio?connected=1")
  } catch (e) {
    return redirect("/studio?connected=0&error=" + encodeURIComponent((e as Error).message))
  }
}

async function studioAuthCallback(url: URL, config: HandlerConfig, handlerUrl: string): Promise<Response> {
  const code = url.searchParams.get('code')
  if (!code) return json({ error: 'missing code' }, 400)
  return authCallback(code, config, handlerUrl)
}

async function storeRefreshToken(refreshToken: string, config: HandlerConfig, mk: MasterKey): Promise<void> {
  if (!config.tokenStore) throw new Error('GDDB: tokenStore not configured')
  let rootFolderId = config.rootFolderId
  if (!rootFolderId && config.drive) {
    const folder = await config.drive.findByName('root', 'gd-db') ?? await config.drive.createFolder('root', 'gd-db')
    rootFolderId = folder.id
  }
  const tokenData = JSON.stringify({ refreshToken })
  const encrypted = await encryptBytes(new TextEncoder().encode(tokenData), mk)
  await config.tokenStore.set({ refreshTokenCipher: Buffer.from(encrypted).toString('base64'), rootFolderId: rootFolderId ?? '' })
}

async function studioStatus(config: HandlerConfig): Promise<Response> {
  const token = await config.tokenStore?.get()
  return json({ connected: !!token, rootFolderId: token?.rootFolderId ?? null })
}

// --- Studio admin routes ---

async function studioAdminRoute(path: string, req: Request, url: URL, config: HandlerConfig): Promise<Response> {
  await initEngines(config)
  const { queryEngine: qe, storageEngine: se } = getEngines()!

  // /studio/api/tables
  if (path === '/studio/api/tables' && req.method === 'GET') {
    return json({ tables: Object.keys(config.schema.tables) })
  }

  // /studio/api/buckets
  if (path === '/studio/api/buckets' && req.method === 'GET') {
    return json({ buckets: Object.keys(config.schema.storage?.buckets ?? {}) })
  }

  // /studio/api/data/:table
  if (path.startsWith('/studio/api/data/') && req.method === 'GET') {
    const table = path.slice('/studio/api/data/'.length).split('/')[0]
    try {
      const result = await qe.execute({ table, method: 'select', columns: ['*'] })
      return json(result)
    } catch (e) {
      return json({ data: [], error: { message: (e as Error).message } })
    }
  }

  // /studio/api/data/:table (POST - insert)
  if (path.startsWith('/studio/api/data/') && req.method === 'POST') {
    const table = path.slice('/studio/api/data/'.length).split('/')[0]
    try {
      const body = await req.json()
      const result = await qe.execute({ table, method: 'insert', values: Array.isArray(body) ? body : [body] })
      return json(result)
    } catch (e) {
      return json({ data: null, error: { message: (e as Error).message } })
    }
  }

  // /studio/api/storage/list/:bucket
  if (path.startsWith('/studio/api/storage/list/') && req.method === 'GET') {
    const bucket = path.slice('/studio/api/storage/list/'.length).split('/')[0]
    const files = await se.list(bucket, url.searchParams.get('prefix') ?? undefined)
    return json(files)
  }

  // /studio/api/storage/upload/:bucket/:path
  if (path.startsWith('/studio/api/storage/upload/') && req.method === 'POST') {
    const rest = path.slice('/studio/api/storage/upload/'.length)
    const [bucket, ...parts] = rest.split('/')
    const filePath = parts.join('/')
    const contentType = req.headers.get('content-type') ?? 'application/octet-stream'
    const data = new Uint8Array(await req.arrayBuffer())
    const result = await se.upload(bucket, filePath, data, contentType)
    return json(result)
  }

  return json({ error: 'not found' }, 404)
}

// --- Storage API routes ---

async function storageRoute(path: string, req: Request, url: URL, config: HandlerConfig): Promise<Response> {
  const mk = await importMasterKey(config.masterKey)
  const token = await config.tokenStore?.get()
  const rootFolderId = config.rootFolderId ?? token?.rootFolderId ?? ''
  if (!rootFolderId && !config.drive) return json({ error: 'not connected' }, 500)

  let drive: DriveAdapter = config.drive!
  if (!drive) {
    if (!config.clientId || !config.clientSecret || !token) return json({ error: 'not connected' }, 500)
    const plain = await decryptToken(token.refreshTokenCipher, mk)
    drive = new GoogleDriveAdapter({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: plain })
  }

  const storageFolder = await drive.findByName(rootFolderId, 'storage') ?? await drive.createFolder(rootFolderId, 'storage')
  const storage = new StorageEngine(config.schema, drive, storageFolder.id, mk)

  if (path.includes('/object/')) {
    const rest = path.slice(path.indexOf('/object/') + '/object/'.length)
    const [bucket, ...parts] = rest.split('/')
    const filePath = parts.join('/')
    if (req.method === 'GET') {
      try {
        const data = await storage.download(bucket, filePath)
        return new Response(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as unknown as BodyInit, { headers: { 'content-type': 'application/octet-stream', ...corsHeaders() } })
      } catch (e) {
        return json({ error: (e as Error).message }, 404)
      }
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const data = new Uint8Array(await req.arrayBuffer())
      const result = await storage.upload(bucket, filePath, data)
      return json(result)
    }
    if (req.method === 'DELETE') {
      await storage.remove(bucket, [filePath])
      return json({ success: true })
    }
  }

  if (path.includes('/list/')) {
    const bucket = path.slice(path.indexOf('/list/') + '/list/'.length).split('/')[0]
    const list = await storage.list(bucket, url.searchParams.get('prefix') ?? undefined, Number(url.searchParams.get('limit') ?? 100), Number(url.searchParams.get('offset') ?? 0))
    return json(list)
  }

  if (path.endsWith('/bucket') && req.method === 'POST') {
    const body = await req.json()
    const id = await storage.ensureBucket(body.bucket)
    return json({ id })
  }

  return json({ error: 'not found' }, 404)
}

// --- Studio asset serving ---

async function serveStudioAsset(path: string): Promise<Response> {
  const filePath = path === '/studio' ? '/studio/index.html' : path
  try {
    const fs = await import('node:fs/promises')
    const pathMod = await import('node:path')
    const distDir = pathMod.resolve(process.cwd(), 'studio/dist')
    let relPath = filePath.replace('/studio/', '')
    if (relPath === '' || relPath === 'index.html') relPath = 'index.html'
    const abs = pathMod.join(distDir, relPath)
    const content = await fs.readFile(abs)
    const ext = pathMod.extname(abs)
    const mime = mimeTypes[ext] ?? 'application/octet-stream'
    return new Response(content, { headers: { 'content-type': mime, 'cache-control': 'public, max-age=3600', ...corsHeaders() } })
  } catch {
    return new Response('Studio not found. Run npm run build:studio.', { status: 404 })
  }
}

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

// --- Helpers ---

function checkAnonKey(req: Request, anonKey: string): Response | null {
  const auth = req.headers.get('authorization')
  const key = auth?.replace('Bearer ', '') ?? ''
  if (key !== anonKey) return json({ error: 'invalid or missing anon key' }, 401)
  return null
}

async function checkSession(req: Request, config: HandlerConfig): Promise<Response | null> {
  const auth = req.headers.get('authorization')
  const token = auth?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'unauthorized' }, 401)
  const mk = await importMasterKey(config.masterKey)
  const valid = await verifySessionToken(token, mk)
  if (!valid) return json({ error: 'invalid session' }, 401)
  return null
}

async function studioLogin(req: Request, config: HandlerConfig): Promise<Response> {
  const body = await req.json()
  if (body.password !== config.dashboardPassword) return json({ error: 'invalid password' }, 401)
  const mk = await importMasterKey(config.masterKey)
  return json({ token: await encodeSessionToken(mk) }, 200)
}

function decryptToken(cipher: string, mk: MasterKey): Promise<string> {
  return decryptBytes(Buffer.from(cipher, 'base64'), mk).then((b) => new TextDecoder().decode(b))
}


function buildAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    scope: 'https://www.googleapis.com/auth/drive',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function exchangeCode(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<any> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description ?? data.error)
  return data
}

let _engines: { queryEngine: QueryEngine; storageEngine: StorageEngine } | null = null
async function initEngines(config: HandlerConfig): Promise<void> {
  if (_engines) return
  const mk = await importMasterKey(config.masterKey)
  let drive: DriveAdapter = config.drive!
  if (!drive) {
    if (!config.clientId || !config.clientSecret) throw new Error('GDDB: drive or OAuth credentials required')
    const token = await config.tokenStore?.get()
    if (!token) throw new Error('GDDB: not connected to Google Drive')
    const plain = await decryptToken(token.refreshTokenCipher, mk)
    drive = new GoogleDriveAdapter({ clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: plain })
  }
  const token = await config.tokenStore?.get()
  const rootFolderId = config.rootFolderId ?? token?.rootFolderId ?? ''
  if (!rootFolderId) throw new Error('GDDB: root folder not initialized')
  const tablesFolder = await drive.findByName(rootFolderId, 'tables') ?? await drive.createFolder(rootFolderId, 'tables')
  const storageFolder = await drive.findByName(rootFolderId, 'storage') ?? await drive.createFolder(rootFolderId, 'storage')
  _engines = { queryEngine: new QueryEngine(config.schema, drive, tablesFolder.id, mk), storageEngine: new StorageEngine(config.schema, drive, storageFolder.id, mk) }
}

function getEngines() { return _engines }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...corsHeaders() } })
}

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { location: url } })
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
  }
}

function generateOtc(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  const hex: string[] = []
  for (const b of bytes) hex.push(b.toString(16).padStart(2, "0"))
  return hex.join("")
}
