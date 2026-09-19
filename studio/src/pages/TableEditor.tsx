import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'

export function TableEditor() {
  const [tables, setTables] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api('tables').then((d) => { setTables(d.tables ?? []); if (d.tables?.[0]) setSelected(d.tables[0]) })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    api(`data/${selected}`).then((d) => { setRows(d.data ?? []); setLoading(false) })
  }, [selected])

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {tables.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {loading ? <p>Loading...</p> : rows.length === 0 ? <p style={{ color: 'var(--color-text-muted)' }}>No data</p> : (
        <table>
          <thead><tr>{Object.keys(rows[0]).map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => <tr key={i}>{Object.values(r).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>)}
          </tbody>
        </table>
      )}
    </div>
  )
}
