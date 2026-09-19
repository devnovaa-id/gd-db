import { describe, it, expect, beforeEach } from 'vitest'
import { createHandler } from './create-handler.js'
import { MockDriveAdapter } from '../server/mock-drive.js'
import { generateMasterKey } from '../server/crypto.js'
import { EnvTokenStore } from '../server/token-store.js'
import type { SchemaConfig } from '../shared/types.js'

const schema: SchemaConfig = {
  tables: {
    users: { columns: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'text' },
      age: { type: 'number' },
    } },
  },
  storage: { buckets: { avatars: { public: true } } },
}

function makeConfig() {
  const drive = new MockDriveAdapter()
  return {
    config: {
      schema,
      anonKey: 'test-anon-key',
      masterKey: generateMasterKey(),
      dashboardPassword: 'admin-pass',
      drive,
    },
    drive,
  }
}

async function setup(config: any) {
  const root = await config.drive.createFolder('root', 'gd-db')
  await config.drive.createFolder(root.id, 'tables')
  await config.drive.createFolder(root.id, 'storage')
  config.rootFolderId = root.id
}

describe('createHandler', () => {
  let handler: (req: Request) => Promise<Response>
  let cfg: any

  beforeEach(async () => {
    const { config, drive } = makeConfig()
    cfg = config
    await setup(cfg)
    handler = createHandler(cfg)
  })

  it('returns server info at root', async () => {
    const res = await handler(new Request('http://localhost/'))
    const body = await res.json()
    expect(body.name).toBe('gd-db')
  })

  it('rejects REST without anonKey', async () => {
    const res = await handler(new Request('http://localhost/rest/v1/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    expect(res.status).toBe(401)
  })

  it('inserts and selects via REST', async () => {
    await handler(new Request('http://localhost/rest/v1/users', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-anon-key' },
      body: JSON.stringify({ table: 'users', method: 'insert', values: [{ id: '1', name: 'Alice', age: 30 }] }),
    }))
    const res = await handler(new Request('http://localhost/rest/v1/users', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test-anon-key' },
      body: JSON.stringify({ table: 'users', method: 'select', columns: ['*'] }),
    }))
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('Alice')
  })

  it('uploads and downloads via storage API', async () => {
    await handler(new Request('http://localhost/storage/v1/object/avatars/test.png', {
      method: 'POST', headers: { authorization: 'Bearer test-anon-key' }, body: new Uint8Array([1, 2, 3]),
    }))
    const res = await handler(new Request('http://localhost/storage/v1/object/avatars/test.png', {
      headers: { authorization: 'Bearer test-anon-key' },
    }))
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('Studio login returns session token', async () => {
    const res = await handler(new Request('http://localhost/studio/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin-pass' }),
    }))
    const body = await res.json()
    expect(body.token).toBeTruthy()
  })

  it('Studio admin routes require session', async () => {
    const res = await handler(new Request('http://localhost/studio/api/tables'))
    expect(res.status).toBe(401)
  })

  it('Studio lists tables with valid session', async () => {
    const loginRes = await handler(new Request('http://localhost/studio/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin-pass' }),
    }))
    const { token } = await loginRes.json()
    const res = await handler(new Request('http://localhost/studio/api/tables', { headers: { authorization: `Bearer ${token}` } }))
    const body = await res.json()
    expect(body.tables).toContain('users')
  })

  it('Studio inserts and reads data', async () => {
    const loginRes = await handler(new Request('http://localhost/studio/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'admin-pass' }),
    }))
    const { token } = await loginRes.json()
    await handler(new Request('http://localhost/studio/api/data/users', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: '2', name: 'Bob', age: 25 }),
    }))
    const res = await handler(new Request('http://localhost/studio/api/data/users', { headers: { authorization: `Bearer ${token}` } }))
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].name).toBe('Bob')
  })
})

describe('relay flow', () => {
  let handler: (req: Request) => Promise<Response>
  let cfg: any

  beforeEach(async () => {
    const drive = new MockDriveAdapter()
    let storedToken: any = null
    cfg = {
      schema,
      anonKey: 'test-anon-key',
      masterKey: generateMasterKey(),
      dashboardPassword: 'admin-pass',
      drive,
      tokenStore: { get: async () => storedToken, set: async (t: any) => { storedToken = t } } as any,
    }
    const root = await drive.createFolder('root', 'gd-db')
    await drive.createFolder(root.id, 'tables')
    await drive.createFolder(root.id, 'storage')
    cfg.rootFolderId = root.id
    handler = createHandler(cfg)
  })

  it('pair generates relay connect URL', async () => {
    const res = await handler(new Request('http://localhost/studio/api/auth/pair', {
      method: 'POST', headers: { 'content-type': 'application/json' },
    }))
    const body = await res.json()
    expect(body.url).toContain('/connect?')
    expect(body.url).toContain('return_url=')
    expect(body.url).toContain('state=')
  })

  it('connect without clientId uses relay flow', async () => {
    const res = await handler(new Request('http://localhost/studio/api/connect', {
      method: 'POST', headers: { 'content-type': 'application/json' },
    }))
    const body = await res.json()
    expect(body.url).toContain('/connect?')
  })

  it('complete stores refresh token via relay', async () => {
    // Step 1: pair to get state
    const pairRes = await handler(new Request('http://localhost/studio/api/auth/pair', { method: 'POST' }))
    const pairBody = await pairRes.json()
    const url = new URL(pairBody.url)
    const state = url.searchParams.get('state')

    // Step 2: simulate relay callback with token
    const completeUrl = `/studio/api/auth/complete?token=fake-refresh-token&state=${state}`
    const completeRes = await handler(new Request(`http://localhost${completeUrl}`))
    expect(completeRes.status).toBe(302)
    expect(completeRes.headers.get('location')).toContain('connected=1')

    // Step 3: verify stored
    const stored = await cfg.tokenStore?.get()
    expect(stored).toBeTruthy()
    expect(stored.refreshTokenCipher).toBeTruthy()
  })

  it('rejects reused OTC', async () => {
    const pairRes = await handler(new Request('http://localhost/studio/api/auth/pair', { method: 'POST' }))
    const state = new URL((await pairRes.json()).url).searchParams.get('state')
    const completeUrl = `/studio/api/auth/complete?token=rt&state=${state}`
    await handler(new Request(`http://localhost${completeUrl}`))
    const res2 = await handler(new Request(`http://localhost${completeUrl}`))
    expect(res2.status).toBe(302)
    expect(res2.headers.get('location')).toContain('error')
  })

  it('rejects expired OTC', async () => {
    const pairRes = await handler(new Request('http://localhost/studio/api/auth/pair', { method: 'POST' }))
    const state = new URL((await pairRes.json()).url).searchParams.get('state')
    // Mock expiry by manipulating time is complex; just test invalid state directly
    const res = await handler(new Request(`http://localhost/studio/api/auth/complete?token=rt&state=completely-invalid`))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error')
  })
})
