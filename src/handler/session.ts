import type { MasterKey } from '../server/crypto.js'

export function getHandlerUrl(): string {
  return process?.env?.GDDB_HANDLER_URL ?? ''
}

// Derive handler URL from the request's Host header as fallback
export function resolveHandlerUrl(req: Request): string {
  const envUrl = getHandlerUrl()
  if (envUrl) return envUrl
  // Fallback: construct from request URL
  try {
    const url = new URL(req.url)
    const proto = url.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https' ? 'https' : 'http'
    return `${proto}://${url.host}`
  } catch {
    return ''
  }
}

export async function encodeSessionToken(masterKey: MasterKey): Promise<string> {
  const payload = { exp: Date.now() + 3600_000 }
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const iv = new Uint8Array(12)
  globalThis.crypto.getRandomValues(iv)
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey.cryptoKey, data)
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)
  return Buffer.from(combined).toString('base64url')
}

export async function verifySessionToken(token: string, masterKey: MasterKey): Promise<boolean> {
  try {
    const combined = Buffer.from(token, 'base64url')
    const iv = combined.subarray(0, 12)
    const data = combined.subarray(12)
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, masterKey.cryptoKey, data)
    const payload = JSON.parse(new TextDecoder().decode(plain))
    return payload.exp > Date.now()
  } catch {
    return false
  }
}
