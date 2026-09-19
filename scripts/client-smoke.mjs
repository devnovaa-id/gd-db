// Test the real client SDK (createClient) against a live HTTP server
import { createHandler } from '../dist/handler/index.js'
import { createClient } from '../dist/client/index.js'
import { MockDriveAdapter, generateMasterKey } from '../dist/server/index.js'

const schema = {
  tables: {
    products: { columns: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'text' },
      price: { type: 'number' },
    } },
  },
  storage: { buckets: { files: { public: true } } },
}

const drive = new MockDriveAdapter()
const root = await drive.createFolder('root', 'gd-db')
await drive.createFolder(root.id, 'tables')
await drive.createFolder(root.id, 'storage')

const handler = createHandler({
  schema, anonKey: 'test-key', masterKey: generateMasterKey(),
  dashboardPassword: 'pass', drive, rootFolderId: root.id,
})

// Start a real HTTP server using the handler
import http from 'node:http'

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on("data", c => chunks.push(c))
    req.on("end", () => resolve(Buffer.concat(chunks)))
  })
}
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v[0] : v)
  const body = req.method !== 'GET' && req.method !== 'HEAD' ? await readBody(req) : undefined
  const request = new Request(url, { method: req.method, headers, body })
  const response = await handler(request)
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : '')
})

const PORT = 9876
await new Promise(r => httpServer.listen(PORT, r))

let pass = 0, fail = 0
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`) }
  else { fail++; console.log(`  ✗ ${msg}`) }
}

const gdb = createClient(`http://localhost:${PORT}`, 'test-key')

console.log('Client SDK smoke test')
console.log('1. Insert')
const { data: ins, error: insErr } = await gdb.from('products').insert({ id: 'p1', name: 'Widget', price: 9.99 })
assert(!insErr, 'insert no error')

console.log('2. Select')
const { data: sel, error: selErr } = await gdb.from('products').select('*')
assert(!selErr, 'select no error')
assert(sel?.length === 1, 'select returns 1 product')
assert(sel[0].name === 'Widget', 'product name is Widget')

console.log('3. Filter select')
const { data: filt } = await gdb.from('products').select('*').eq('price', 9.99)
assert(filt?.length === 1, 'filter by price returns 1')

console.log('4. Update')
await gdb.from('products').update({ price: 14.99 }).eq('id', 'p1')
const { data: after } = await gdb.from('products').select('*')
assert(after[0].price === 14.99, 'price updated to 14.99')

console.log('5. Storage upload + download')
await gdb.storage.from('files').upload('doc.txt', new Uint8Array([65, 66, 67]))
const blob = await gdb.storage.from('files').download('doc.txt')
const arr = new Uint8Array(await blob.arrayBuffer())
assert(arr[0] === 65 && arr[1] === 66, 'downloaded content matches')

console.log('6. getPublicUrl')
const pub = gdb.storage.from('files').getPublicUrl('doc.txt')
assert(pub.data.publicUrl.includes('/storage/v1/object/files/doc.txt'), 'public URL format correct')

console.log(`\n${pass} passed, ${fail} failed`)
httpServer.close()
if (fail > 0) process.exit(1)
