import { useEffect, useState, useRef, useCallback } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Member {
  cpse: string
  material_code: string
  description: string
  uom: string
  material_id?: number
}
interface Cluster {
  id: number
  national_code: string
  standardized_description: string
  confidence_score: number
  status: string
  members: Member[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  Approved: 'dot-approved',
  Rejected: 'dot-rejected',
  Pending:  'dot-pending',
}
const STATUS_COLOR: Record<string, string> = {
  Approved: 'var(--color-approved)',
  Rejected: 'var(--color-rejected)',
  Pending:  'var(--color-pending)',
}

function confidenceLabel(score: number) {
  if (score >= 0.95) return 'Exact match'
  if (score >= 0.82) return 'Near duplicate'
  return 'Possible match'
}

function Skel({ w = 'w-24', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`skeleton ${w} ${h} rounded`} />
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ClusterReviewView() {
  const [clusters, setClusters]   = useState<Cluster[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busy, setBusy]           = useState(false)
  const [removing, setRemoving]   = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const listRef    = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    axios.get(`${API}/api/clusters`)
      .then(r => setClusters(r.data.clusters ?? []))
      .catch(() => setError('Could not load clusters. Check the API is running on port 8000.'))
      .finally(() => setLoading(false))
  }, [])

  // ── Keyboard: A = approve, R = reject, arrows = navigate list ─────────────
  const filtered = clusters.filter(c => {
    const s = search.toLowerCase()
    return (
      (!search ||
        c.national_code?.toLowerCase().includes(s) ||
        c.standardized_description?.toLowerCase().includes(s))
      && (!statusFilter || c.status === statusFilter)
    )
  })

  const selectedIndex = filtered.findIndex(c => c.id === selectedId)

  const navigate = useCallback((dir: 1 | -1) => {
    if (filtered.length === 0) return
    const next = Math.max(0, Math.min(filtered.length - 1, selectedIndex + dir))
    setSelectedId(filtered[next].id)
    // scroll into view
    const rows = listRef.current?.querySelectorAll('[data-cluster-row]')
    rows?.[next]?.scrollIntoView({ block: 'nearest' })
  }, [filtered, selectedIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowDown')  { e.preventDefault(); navigate(1) }
      if (e.key === 'ArrowUp')    { e.preventDefault(); navigate(-1) }
      if (e.key === 'Enter' && selectedId === null && filtered[0]) setSelectedId(filtered[0].id)
      if (e.key === 'a' || e.key === 'A') { if (selected && !busy) act(selected.id, 'approve') }
      if (e.key === 'r' || e.key === 'R') { if (selected && !busy) act(selected.id, 'reject') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, selectedId, filtered, busy]) // eslint-disable-line

  const act = async (clusterId: number, action: 'approve' | 'reject') => {
    setBusy(true)
    try {
      await axios.post(`${API}/api/${action}/${clusterId}`)
      setClusters(prev => prev.map(c =>
        c.id === clusterId ? { ...c, status: action === 'approve' ? 'Approved' : 'Rejected' } : c
      ))
    } catch { /* keep UI intact */ }
    finally { setBusy(false) }
  }

  const removeMember = async (clusterId: number, materialCode: string) => {
    setRemoving(materialCode)
    try {
      await axios.delete(`${API}/api/clusters/${clusterId}/members/${encodeURIComponent(materialCode)}`)
      setClusters(prev => prev
        .map(c => {
          if (c.id !== clusterId) return c
          const updated = c.members.filter(m => m.material_code !== materialCode)
          if (updated.length === 0) return null as unknown as Cluster
          return { ...c, members: updated }
        })
        .filter(Boolean) as Cluster[]
      )
    } catch { /* keep UI intact */ }
    finally { setRemoving(null) }
  }

  const selected = clusters.find(c => c.id === selectedId) ?? null

  // ── Loading ────────────────────────────────────────────────────
  if (loading) return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-4">
      <Skel w="w-48" h="h-6" />
      <div className="grid grid-cols-[320px_1fr] gap-5">
        <div className="panel p-4 space-y-3">
          {[0,1,2,3,4].map(i => <Skel key={i} w="w-full" h="h-10"/>)}
        </div>
        <div className="panel p-6 space-y-4">
          <Skel w="w-48" h="h-5"/>
          <Skel w="w-full" h="h-32"/>
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <div className="panel p-6">
        <p style={{ fontWeight: 600, color: 'var(--color-rejected)', marginBottom: 6 }}>Failed to load clusters</p>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>{error}</p>
      </div>
    </div>
  )

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-7 space-y-4">

      {/* ── Page header ── */}
      <div>
        <h1 style={{ fontSize: 'var(--text-page)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Cluster review
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Review AI-identified duplicate clusters. Approve to assign the national code, or reject to flag for rework.
        </p>
      </div>

      {/* ── Summary — plain text with status dots ── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { label: `${clusters.length} total`,    dot: 'dot-neutral' },
          { label: `${clusters.filter(c => c.status === 'Pending').length} pending`,   dot: 'dot-pending' },
          { label: `${clusters.filter(c => c.status === 'Approved').length} approved`, dot: 'dot-approved' },
          { label: `${clusters.filter(c => c.status === 'Rejected').length} rejected`, dot: 'dot-rejected' },
        ].map(({ label, dot }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`dot ${dot}`} />
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search national code or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="field"
          style={{ flex: '1 1 240px', maxWidth: 400 }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="field"
          style={{ flex: '0 0 160px' }}
        >
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', alignSelf: 'center', marginLeft: 4 }}>
          {filtered.length} cluster{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Master / detail ── */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: '320px 1fr', alignItems: 'start' }}
      >

        {/* Cluster list */}
        <div
          className="panel"
          style={{ overflow: 'hidden', maxHeight: 640, display: 'flex', flexDirection: 'column' }}
        >
          <div
            ref={listRef}
            style={{ overflowY: 'auto', flex: 1 }}
            role="listbox"
            aria-label="Clusters"
          >
            {filtered.length === 0 && (
              <p style={{ padding: '24px 16px', fontSize: 'var(--text-body)', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                No clusters match your filters.
              </p>
            )}
            {filtered.map((c, idx) => {
              const isSelected = c.id === selectedId
              return (
                <div
                  key={c.id}
                  data-cluster-row
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => setSelectedId(c.id)}
                  onKeyDown={e => { if (e.key === 'Enter') setSelectedId(c.id) }}
                  style={{
                    borderTop: idx > 0 ? '1px solid var(--color-border)' : undefined,
                    padding: '10px 12px 10px 14px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--color-navy-light)' : undefined,
                    borderLeft: isSelected ? '3px solid var(--color-navy)' : '3px solid transparent',
                    outline: 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p
                        className="font-mono"
                        style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {c.national_code}
                      </p>
                      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.standardized_description}
                      </p>
                    </div>
                    <span style={{ fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                      {Math.round(c.confidence_score * 100)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)' }}>
                      {c.members.length} member{c.members.length !== 1 ? 's' : ''}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className={`dot ${STATUS_DOT[c.status] ?? 'dot-neutral'}`} />
                      <span style={{ fontSize: 'var(--text-meta)', color: STATUS_COLOR[c.status] ?? 'var(--color-text-tertiary)' }}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="panel" style={{ maxHeight: 640, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', color: 'var(--color-text-tertiary)' }}>
              <p style={{ fontSize: 'var(--text-body)' }}>Select a cluster from the list to review it.</p>
              <p style={{ fontSize: 'var(--text-meta)', marginTop: 6 }}>Use arrow keys to navigate, A to approve, R to reject.</p>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>National code</p>
                  <p className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {selected.national_code}
                  </p>
                  <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-secondary)', marginTop: 3 }}>
                    {selected.standardized_description}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn btn-approve"
                    onClick={() => act(selected.id, 'approve')}
                    disabled={busy || selected.status === 'Approved'}
                    title="Approve (A)"
                  >
                    Approve
                    <kbd style={{ fontSize: 10, opacity: 0.7, fontFamily: 'IBM Plex Mono, monospace', marginLeft: 2 }}>A</kbd>
                  </button>
                  <button
                    className="btn btn-reject"
                    onClick={() => act(selected.id, 'reject')}
                    disabled={busy || selected.status === 'Rejected'}
                    title="Reject (R)"
                  >
                    Reject
                    <kbd style={{ fontSize: 10, opacity: 0.7, fontFamily: 'IBM Plex Mono, monospace', marginLeft: 2 }}>R</kbd>
                  </button>
                </div>
              </div>

              {/* AI recommendation — inline label/value pairs between dividers */}
              <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                <p style={{ fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'none', letterSpacing: 0 }}>
                  AI recommendation
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                  {[
                    { label: 'Confidence',   value: `${Math.round(selected.confidence_score * 100)}%` },
                    { label: 'Members',      value: selected.members.length },
                    { label: 'Status',       value: selected.status },
                    { label: 'Match type',   value: confidenceLabel(selected.confidence_score) },
                  ].map((item, i) => (
                    <div
                      key={item.label}
                      style={{
                        borderLeft: i > 0 ? '1px solid var(--color-border)' : undefined,
                        paddingLeft: i > 0 ? 12 : 0,
                        paddingRight: 12,
                      }}
                    >
                      <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)' }}>{item.label}</p>
                      <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 2 }}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Members table */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table className="table-sticky-head" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['CPSE', 'Material code', 'Description', 'UoM', ''].map((h, i) => (
                        <th
                          key={i}
                          style={{
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: 'var(--text-meta)',
                            fontWeight: 600,
                            color: 'var(--color-text-secondary)',
                            background: 'var(--color-page)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.members.map((m, i) => (
                      <tr
                        key={i}
                        style={{
                          borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                          background: 'transparent',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-page)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          <span className="cpse-tag">{m.cpse}</span>
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>
                            {m.material_code}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', maxWidth: 280 }}>
                          <span
                            title={m.description}
                            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}
                          >
                            {m.description}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                          {m.uom}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', width: 32 }}>
                          {selected.members.length > 1 && (
                            <button
                              onClick={() => removeMember(selected.id, m.material_code)}
                              disabled={removing === m.material_code}
                              title="Remove from cluster"
                              style={{
                                width: 22, height: 22,
                                border: '1px solid var(--color-border-mid)',
                                borderRadius: 4,
                                background: 'transparent',
                                cursor: 'pointer',
                                color: 'var(--color-rejected)',
                                fontSize: 16,
                                lineHeight: 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: removing === m.material_code ? 0.4 : 0,
                              }}
                              className="remove-btn"
                            >
                              −
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
