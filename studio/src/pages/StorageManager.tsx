import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'

export function StorageManager() {
  const [buckets, setBuckets] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [files, setFiles] = useState<any[]>([])

  useEffect(() => { api('buckets').then((d) => { setBuckets(d.buckets ?? []); if (d.buckets?.[0]) setSelected(d.buckets[0]) }) }, [])

  useEffect(() => {
    if (!selected) return
    api(`storage/list/${selected}`).then(setFiles)
  }, [selected])

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selected) return
    const formData = new FormData()
    formData.append('file', file)
    await fetch(`/studio/api/storage/upload/${selected}/${file.name}`, { method: 'POST', body: formData, headers: { authorization: `Bearer ${sessionStorage.getItem('gddb_token')}` } })
    const updated = await api(`storage/list/${selected}`)
    setFiles(updated)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {buckets.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <input type="file" onChange={upload} />
      </div>
      <table>
        <thead><tr><th>Name</th><th>MIME</th></tr></thead>
        <tbody>{files.map((f, i) => <tr key={i}><td>{f.name}</td><td>{f.mimeType}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
