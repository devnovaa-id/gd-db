import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'

export function Settings() {
  const [status, setStatus] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') setError('')
    else if (params.get('connected') === '0') setError(params.get('error') || 'Connection failed')
    api('status').then(setStatus)
  }, [])

  const connect = async () => {
    setError('')
    const res = await api('connect', { method: 'POST' })
    if (res.url) window.location.href = res.url
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Settings</h2>
      <div style={{ background: 'var(--color-surface)', padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <p style={{ marginBottom: 8 }}>Drive Connection: <strong>{status?.connected ? 'Connected' : 'Not Connected'}</strong></p>
        {status?.rootFolderId && <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Root folder: {status.rootFolderId}</p>}
        {error && <p style={{ color: '#ef4444', marginBottom: 8, fontSize: 13 }}>{error}</p>}
        {!status?.connected && <button onClick={connect}>Connect Google Drive</button>}
      </div>
      <div style={{ background: 'var(--color-surface)', padding: 16, borderRadius: 8 }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>gd-db v0.1.0 — by thiskey (DevNova-ID — DreamToRealiityCreative)</p>
      </div>
    </div>
  )
}
