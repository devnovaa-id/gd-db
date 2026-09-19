import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../hooks/useApi'

export function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(password)
    if (ok) navigate('/studio')
    else setError('Invalid password')
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{ width: 320, textAlign: 'center' }}>
        <h1 style={{ marginBottom: 24, color: 'var(--color-primary)' }}>gd-db Studio</h1>
        <input type="password" placeholder="Dashboard password" value={password}
          onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
        {error && <p style={{ color: 'red', marginBottom: 8 }}>{error}</p>}
        <button type="submit" style={{ width: '100%' }}>Login</button>
      </form>
    </div>
  )
}
