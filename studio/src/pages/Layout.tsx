import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { getToken } from '../hooks/useApi'

export function Layout() {
  if (!getToken()) return <Navigate to="/studio/login" replace />
  const link = { padding: '8px 16px', borderRadius: 6, fontSize: 14 }
  const active = { ...link, background: 'var(--color-primary)', color: '#000' }
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 200, borderRight: '1px solid var(--color-border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ color: 'var(--color-primary)', marginBottom: 16, fontSize: 18 }}>gd-db</h2>
        <NavLink to="/studio" end style={({ isActive }) => (isActive ? active : link)}>Tables</NavLink>
        <NavLink to="/studio/storage" style={({ isActive }) => (isActive ? active : link)}>Storage</NavLink>
        <NavLink to="/studio/settings" style={({ isActive }) => (isActive ? active : link)}>Settings</NavLink>
      </nav>
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
