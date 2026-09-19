import { describe, it, expect } from 'vitest'
import { generateMasterKey, importMasterKey, encryptBytes, decryptBytes, createChunkStream, decryptChunk, parseChunkHeader } from './crypto.js'

describe('crypto', () => {
  it('round-trips encrypt/decrypt', async () => {
    const mk = await importMasterKey(generateMasterKey())
    const plain = new TextEncoder().encode('hello gd-db')
    const enc = await encryptBytes(plain, mk)
    const dec = await decryptBytes(enc, mk)
    expect(new TextDecoder().decode(dec)).toBe('hello gd-db')
  })

  it('fails on tampered ciphertext (GCM tag)', async () => {
    const mk = await importMasterKey(generateMasterKey())
    const enc = await encryptBytes(new TextEncoder().encode('data'), mk)
    enc[enc.length - 1] ^= 0xff
    await expect(decryptBytes(enc, mk)).rejects.toThrow()
  })

  it('envelope: different DEK per encrypt', async () => {
    const mk = await importMasterKey(generateMasterKey())
    const e1 = await encryptBytes(new TextEncoder().encode('a'), mk)
    const e2 = await encryptBytes(new TextEncoder().encode('a'), mk)
    expect(e1).not.toEqual(e2)
  })

  it('chunk stream encrypt/decrypt', async () => {
    const mk = await importMasterKey(generateMasterKey())
    const stream = await createChunkStream(mk)
    const chunk1 = await stream.encryptChunk(new TextEncoder().encode('part1'), 0)
    const chunk2 = await stream.encryptChunk(new TextEncoder().encode('part2'), 1)
    const combined = new Uint8Array(stream.header.length + chunk1.length + chunk2.length)
    combined.set(stream.header, 0)
    combined.set(chunk1, stream.header.length)
    combined.set(chunk2, stream.header.length + chunk1.length)
    const parsed = parseChunkHeader(combined, mk)
    const dek = await parsed.dek
    const d1 = await decryptChunk(combined.subarray(stream.header.length, stream.header.length + chunk1.length), dek)
    const d2 = await decryptChunk(combined.subarray(stream.header.length + chunk1.length), dek)
    expect(new TextDecoder().decode(d1)).toBe('part1')
    expect(new TextDecoder().decode(d2)).toBe('part2')
  })
})
