import { createHandler } from '../dist/handler/index.js'
import { MockDriveAdapter, generateMasterKey } from '../dist/server/index.js'

const drive = new MockDriveAdapter()
const root = await drive.createFolder('root', 'gd-db')
const handler = createHandler({
  schema: { tables: { users: { columns: { id: { type: 'uuid', primaryKey: true } } } } },
  anonKey: 'key', masterKey: generateMasterKey(), dashboardPassword: 'pass',
  drive, rootFolderId: root.id,
})

// Test /studio serves index.html
const res = await handler(new Request('http://localhost/studio'))
console.log(`✓ /studio returns ${res.status} (${res.headers.get('content-type')})`)

// Test root endpoint
const r2 = await handler(new Request('http://localhost/'))
const b2 = await r2.json()
console.log(`✓ / returns name=${b2.name}, version=${b2.version}`)

// Test CORS preflight
const r3 = await handler(new Request('http://localhost/rest/v1/users', { method: 'OPTIONS' }))
console.log(`✓ OPTIONS preflight returns ${r3.status}`)
console.log('Studio serving: OK')
