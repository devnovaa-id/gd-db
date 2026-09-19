export function getToken(): string | null {
  return sessionStorage.getItem('gddb_token')
}

export function setToken(token: string) {
  sessionStorage.setItem('gddb_token', token)
}

export async function api(path: string, opts?: RequestInit): Promise<any> {
  const token = getToken()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers['authorization'] = `Bearer ${token}`
  const res = await fetch(`/studio/api/${path}`, { ...opts, headers: { ...headers, ...(opts?.headers as any) } })
  return res.json()
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch('/studio/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const data = await res.json()
  if (data.token) {
    setToken(data.token)
    return true
  }
  return false
}
