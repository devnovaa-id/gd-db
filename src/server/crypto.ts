import { MAGIC, VERSION, KEY_ID, IV_LENGTH, DEK_LENGTH, HEADER_LENGTH, CHUNK_COUNTER_LENGTH } from '../shared/types.js'

const subtle = globalThis.crypto.subtle
const NONCE = 12

export interface MasterKey {
  keyId: number
  raw: Uint8Array
  cryptoKey: CryptoKey
}

export function base64Encode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function base64Decode(str: string): Uint8Array {
  const bin = atob(str)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function generateMasterKey(): string {
  const bytes = new Uint8Array(DEK_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  return base64Encode(bytes)
}

export async function importMasterKey(b64: string): Promise<MasterKey> {
  const raw = base64Decode(b64)
  if (raw.length !== DEK_LENGTH) throw new Error('GDDB: master key must be 32 bytes (base64)')
  const cryptoKey = await subtle.importKey('raw', asBuf(raw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'])
  return { keyId: KEY_ID, raw, cryptoKey }
}

async function generateDek(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

async function wrapDek(dek: CryptoKey, masterKey: CryptoKey): Promise<Uint8Array> {
  const iv = new Uint8Array(IV_LENGTH)
  globalThis.crypto.getRandomValues(iv)
  const wrapped = await subtle.encrypt({ name: 'AES-GCM', iv: asBuf(iv) }, masterKey, asBuf(new Uint8Array(await subtle.exportKey('raw', dek) as ArrayBuffer)))
  const out = new Uint8Array(IV_LENGTH + wrapped.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(wrapped), IV_LENGTH)
  return out
}

async function unwrapDek(wrapped: Uint8Array, masterKey: CryptoKey): Promise<CryptoKey> {
  const iv = wrapped.subarray(0, IV_LENGTH)
  const data = wrapped.subarray(IV_LENGTH)
  const raw = await subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, masterKey, asBuf(data))
  return subtle.importKey('raw', asBuf(new Uint8Array(raw)), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptBytes(plaintext: Uint8Array, masterKey: MasterKey): Promise<Uint8Array> {
  const dek = await generateDek()
  const wrappedDek = await wrapDek(dek, masterKey.cryptoKey)
  const iv = new Uint8Array(IV_LENGTH)
  globalThis.crypto.getRandomValues(iv)
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: asBuf(iv) }, dek, asBuf(plaintext))
  const out = new Uint8Array(HEADER_LENGTH + wrappedDek.length + IV_LENGTH + ciphertext.byteLength)
  out.set(textToBytes(MAGIC), 0)
  out[4] = VERSION
  out[5] = masterKey.keyId
  new DataView(out.buffer).setUint32(6, wrappedDek.length, false)
  out.set(wrappedDek, HEADER_LENGTH)
  out.set(iv, HEADER_LENGTH + wrappedDek.length)
  out.set(new Uint8Array(ciphertext), HEADER_LENGTH + wrappedDek.length + IV_LENGTH)
  return out
}

export async function decryptBytes(blob: Uint8Array, masterKey: MasterKey): Promise<Uint8Array> {
  if (blob.length < HEADER_LENGTH + IV_LENGTH) throw new Error('GDDB: encrypted blob too small')
  if (bytesToText(blob.subarray(0, 4)) !== MAGIC) throw new Error('GDDB: invalid blob magic')
  if (blob[4] !== VERSION) throw new Error(`GDDB: unsupported blob version ${blob[4]}`)
  const view = new DataView(blob.buffer, blob.byteOffset)
  const wrappedLen = view.getUint32(6, false)
  const offset = HEADER_LENGTH
  const wrappedDek = blob.subarray(offset, offset + wrappedLen)
  const iv = blob.subarray(offset + wrappedLen, offset + wrappedLen + IV_LENGTH)
  const ciphertext = blob.subarray(offset + wrappedLen + IV_LENGTH)
  const dek = await unwrapDek(wrappedDek, masterKey.cryptoKey)
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, dek, asBuf(ciphertext)))
}

export interface ChunkStream {
  header: Uint8Array
  encryptChunk: (chunk: Uint8Array, index: number) => Promise<Uint8Array>
}

export async function createChunkStream(masterKey: MasterKey): Promise<ChunkStream> {
  const dek = await generateDek()
  const wrappedDek = await wrapDek(dek, masterKey.cryptoKey)
  const header = new Uint8Array(HEADER_LENGTH + wrappedDek.length)
  header.set(textToBytes(MAGIC), 0)
  header[4] = VERSION
  header[5] = masterKey.keyId
  new DataView(header.buffer).setUint32(6, wrappedDek.length, false)
  header.set(wrappedDek, HEADER_LENGTH)
  return {
    header,
    async encryptChunk(chunk, index) {
      const counter = new Uint8Array(CHUNK_COUNTER_LENGTH)
      const dv = new DataView(counter.buffer)
      dv.setUint32(0, Math.floor(index / 0x100000000), false)
      dv.setUint32(4, index >>> 0, false)
      const iv = new Uint8Array(NONCE)
      iv.set(counter, 0)
      globalThis.crypto.getRandomValues(iv.subarray(CHUNK_COUNTER_LENGTH))
      const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: asBuf(iv) }, dek, asBuf(chunk))
      const out = new Uint8Array(CHUNK_COUNTER_LENGTH + (NONCE - CHUNK_COUNTER_LENGTH) + ciphertext.byteLength)
      out.set(counter, 0)
      out.set(iv.subarray(CHUNK_COUNTER_LENGTH), CHUNK_COUNTER_LENGTH)
      out.set(new Uint8Array(ciphertext), CHUNK_COUNTER_LENGTH + (NONCE - CHUNK_COUNTER_LENGTH))
      return out
    },
  }
}

export function parseChunkHeader(blob: Uint8Array, masterKey: MasterKey): { dek: Promise<CryptoKey>; offset: number } {
  if (bytesToText(blob.subarray(0, 4)) !== MAGIC) throw new Error('GDDB: invalid chunk magic')
  const view = new DataView(blob.buffer, blob.byteOffset)
  const wrappedLen = view.getUint32(6, false)
  const wrappedDek = blob.subarray(HEADER_LENGTH, HEADER_LENGTH + wrappedLen)
  return { dek: unwrapDek(wrappedDek, masterKey.cryptoKey), offset: HEADER_LENGTH + wrappedLen }
}

export async function decryptChunk(chunk: Uint8Array, dek: CryptoKey): Promise<Uint8Array> {
  const counter = chunk.subarray(0, CHUNK_COUNTER_LENGTH)
  const ivTail = chunk.subarray(CHUNK_COUNTER_LENGTH, NONCE)
  const iv = new Uint8Array(NONCE)
  iv.set(counter, 0)
  iv.set(ivTail, CHUNK_COUNTER_LENGTH)
  const ciphertext = chunk.subarray(NONCE)
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, dek, asBuf(ciphertext)))
}

function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function bytesToText(b: Uint8Array): string {
  return new TextDecoder().decode(b)
}


// Cast helper for Web Crypto BufferSource / BodyInit compatibility
function asBuf(u: Uint8Array): BufferSource {
  const ab = new ArrayBuffer(u.byteLength)
  new Uint8Array(ab).set(u)
  return ab
}
