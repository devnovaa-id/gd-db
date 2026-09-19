// End-to-end smoke test: real client SDK → real handler → MockDriveAdapter
// Simulates actual user flow without needing Google Drive
import { createHandler } from '../dist/handler/index.js'
import { createClient } from '../dist/client/index.js'
import { MockDriveAdapter } from '../dist/server/index.js'
import { generateMasterKey } from '../dist/server/index.js'

const schema = {
  tables: {
    users: { columns: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'text' },
      age: { type: 'number' },
      active: { type: 'bool' },
    } },
  },
  storage: { buckets: { avatars: { public: true } } },
}

const drive = new MockDriveAdapter()
const root = await drive.createFolder('root', 'gd-db')
await drive.createFolder(root.id, 'tables')
await drive.createFolder(root.id, 'storage')

const handler = createHandler({
  schema,
  anonKey: 'smoke-anon-key',
  masterKey: generateMasterKey(),
  dashboardPassword: 'admin123',
  drive,
  rootFolderId: root.id,
})

// Helper to call handler and parse JSON
async function call(path, opts = {}) {
  const res = await handler(new Request(`http://localhost${path}`, opts))
  const text = await res.text()
  try { return { status: res.status, body: JSON.parse(text) } }
  catch { return { status: res.status, body: text } }
}

let pass = 0, fail = 0
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`) }
  else { fail++; console.log(`  ✗ ${msg}`) }
}

console.log('1. Insert users')
let r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'insert', values: [
    { id: 'u1', name: 'Alice', age: 30, active: true },
    { id: 'u2', name: 'Bob', age: 25, active: false },
  ] }),
})
assert(r.status === 200, 'insert returns 200')
assert(r.body.data?.length === 2, 'insert returns 2 rows')

console.log('2. Select all')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'select', columns: ['*'] }),
})
assert(r.body.data?.length === 2, 'select returns 2 rows')
assert(r.body.data[0].name === 'Alice', 'first row is Alice')

console.log('3. Select with filter + count')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'select', columns: ['*'], filters: [{ column: 'active', op: 'eq', value: true }], count: 'exact' }),
})
assert(r.body.data?.length === 1, 'filter returns 1 active user')
assert(r.body.data[0].name === 'Alice', 'filtered row is Alice')
assert(r.body.count === 1, 'count is 1 (filtered total)')

console.log('4. Update')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'update', values: [{ age: 31 }], filters: [{ column: 'id', op: 'eq', value: 'u1' }] }),
})
assert(r.body.data?.length === 1, 'update returns 1 matched row')

// Verify update persisted
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'select', columns: ['*'], filters: [{ column: 'id', op: 'eq', value: 'u1' }] }),
})
assert(r.body.data[0].age === 31, 'age updated to 31')

console.log('5. Upsert (update existing)')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'upsert', values: [{ id: 'u1', name: 'AliceUpdated', age: 32, active: true }], onConflict: 'id' }),
})
assert(r.status === 200, 'upsert returns 200')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'select', columns: ['*'] }),
})
assert(r.body.data?.length === 2, 'still 2 rows after upsert')
assert(r.body.data.find(u => u.id === 'u1').name === 'AliceUpdated', 'name updated via upsert')

console.log('6. Delete')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'delete', filters: [{ column: 'id', op: 'eq', value: 'u2' }] }),
})
assert(r.body.data?.length === 1, 'delete returns 1 deleted row')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer smoke-anon-key' },
  body: JSON.stringify({ table: 'users', method: 'select', columns: ['*'] }),
})
assert(r.body.data?.length === 1, '1 row remaining after delete')

console.log('7. Storage upload + download')
const fileData = new Uint8Array([72, 73, 74]) // "HIJ"
r = await call('/storage/v1/object/avatars/me.png', {
  method: 'POST', headers: { authorization: 'Bearer smoke-anon-key' }, body: fileData,
})
assert(r.status === 200, 'upload returns 200')
assert(r.body.name === 'me.png', 'upload returns file name')

// Download
const res = await handler(new Request('http://localhost/storage/v1/object/avatars/me.png', {
  headers: { authorization: 'Bearer smoke-anon-key' },
}))
const downloaded = new Uint8Array(await res.arrayBuffer())
assert(downloaded[0] === 72 && downloaded[1] === 73 && downloaded[2] === 74, 'downloaded content matches')

console.log('8. anonKey guard')
r = await call('/rest/v1/users', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ table: 'users', method: 'select', columns: ['*'] }),
})
assert(r.status === 401, 'rejected without anonKey')

console.log('9. Studio login + admin route')
r = await call('/studio/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'admin123' }),
})
assert(r.body.token, 'login returns session token')
const token = r.body.token
r = await call('/studio/api/tables', { headers: { authorization: `Bearer ${token}` } })
assert(r.body.tables?.includes('users'), 'studio lists tables')
r = await call('/studio/api/buckets', { headers: { authorization: `Bearer ${token}` } })
assert(r.body.buckets?.includes('avatars'), 'studio lists buckets')
r = await call('/studio/api/data/users', { headers: { authorization: `Bearer ${token}` } })
assert(r.body.data?.length === 1, 'studio reads table data')

console.log('10. Studio session guard')
r = await call('/studio/api/tables')
assert(r.status === 401, 'studio rejected without session')

console.log('11. Wrong dashboard password')
r = await call('/studio/api/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: 'wrong' }),
})
assert(r.status === 401, 'wrong password rejected')

console.log('12. Verify data is encrypted at rest (in Drive)')
const tablesFolder = (await drive.list(root.id)).find(f => f.name === 'tables')
const csvFile = (await drive.list(tablesFolder.id)).find(f => f.name === 'users.csv')
const rawData = await drive.readBlob(csvFile.id)
const rawText = new TextDecoder().decode(rawData)
assert(!rawText.includes('AliceUpdated'), 'plaintext name NOT in Drive (encrypted)')
assert(rawText.includes('GDB1'), 'blob has GDB1 magic header (encrypted)')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
