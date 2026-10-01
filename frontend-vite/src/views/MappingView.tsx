import { useEffect, useState, useMemo } from 'react'
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import axios from 'axios'

const API = 'http://localhost:8000'

interface Mapping {
  cpse: string
  material_code: string
  description: string
  uom: string
  national_code: string | null
  standardized_description: string | null
  status: string
}

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

const ALL_CPSES = ['ONGC','NTPC','SAIL','BHEL','GAIL','IOCL','BPCL','HPCL','Coal India','NMDC']

function Skel({ w = 'w-24', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`skeleton ${w} ${h} rounded`} />
}

export default function MappingView() {
  const [mappings, setMappings]   = useState<Mapping[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [cpseFilter, setCpseFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    axios.get(`${API}/api/mappings`)
      .then(r => setMappings(r.data.mappings ?? []))
      .catch(() => setError('Could not load mappings. Make sure the API is running on port 8000.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => mappings.filter(m => {
    const s = search.toLowerCase()
    return (
      (!search ||
        m.description.toLowerCase().includes(s) ||
        m.material_code.toLowerCase().includes(s) ||
        (m.national_code ?? '').toLowerCase().includes(s))
      && (!cpseFilter   || m.cpse === cpseFilter)
      && (!statusFilter || m.status === statusFilter)
    )
  }), [mappings, search, cpseFilter, statusFilter])

  const columns = useMemo<ColumnDef<Mapping>[]>(() => [
    {
      accessorKey: 'cpse',
      header: 'CPSE',
      cell: i => <span className="cpse-tag">{i.getValue() as string}</span>,
    },
    {
      accessorKey: 'material_code',
      header: 'Material code',
      cell: i => (
        <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>
          {i.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: i => (
        <span
          title={i.getValue() as string}
          style={{ display: 'block', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}
        >
          {i.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'uom',
      header: 'UoM',
      cell: i => <span style={{ color: 'var(--color-text-tertiary)' }}>{i.getValue() as string}</span>,
    },
    {
      accessorKey: 'national_code',
      header: 'National code',
      cell: i => {
        const v = i.getValue() as string | null
        return v
          ? <span className="font-mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{v}</span>
          : <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Not assigned yet</span>
      },
    },
    {
      accessorKey: 'standardized_description',
      header: 'Standardised description',
      cell: i => {
        const v = i.getValue() as string | null
        return v
          ? (
            <span
              title={v}
              style={{ display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}
            >
              {v}
            </span>
          )
          : <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>—</span>
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: i => {
        const v = i.getValue() as string
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`dot ${STATUS_DOT[v] ?? 'dot-neutral'}`} />
            <span style={{ fontSize: 'var(--text-body)', color: STATUS_COLOR[v] ?? 'var(--color-text-secondary)' }}>{v}</span>
          </div>
        )
      },
    },
  ], [])

  const table = useReactTable({ data: filtered, columns, getCoreRowModel: getCoreRowModel() })

  const exportCSV = () => {
    const header = ['CPSE','Material code','Description','UoM','National code','Standardised description','Status']
    const rows = filtered.map(m => [
      m.cpse, m.material_code, `"${m.description}"`, m.uom,
      m.national_code ?? '', `"${m.standardized_description ?? ''}"`, m.status,
    ])
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'national_material_mapping.csv',
      style: 'display:none',
    })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-4">
      <Skel w="w-56" h="h-6" />
      <div className="panel p-4 space-y-3">
        {[0,1,2,3,4].map(i => <Skel key={i} w="w-full" h="h-8" />)}
      </div>
    </div>
  )

  if (error) return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <div className="panel p-6">
        <p style={{ fontWeight: 600, color: 'var(--color-rejected)', marginBottom: 6 }}>Failed to load mappings</p>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>{error}</p>
      </div>
    </div>
  )

  const approvedCount = filtered.filter(m => m.status === 'Approved').length
  const pendingCount  = filtered.filter(m => m.status === 'Pending').length
  const rejectedCount = filtered.filter(m => m.status === 'Rejected').length

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-7 space-y-4">

      {/* ── Page header ── */}
      <div>
        <h1 style={{ fontSize: 'var(--text-page)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          National material master
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Complete mapping of CPSE material codes to common national codes.
        </p>
      </div>

      {/* ── Filters + export on one row ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search code, description or national code…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="field"
          style={{ flex: '1 1 260px', maxWidth: 380 }}
        />
        <select
          value={cpseFilter}
          onChange={e => setCpseFilter(e.target.value)}
          className="field"
          style={{ flex: '0 0 150px' }}
        >
          <option value="">All CPSEs</option>
          {ALL_CPSES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="field"
          style={{ flex: '0 0 150px' }}
        >
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        {(search || cpseFilter || statusFilter) && (
          <button
            className="btn btn-outline"
            onClick={() => { setSearch(''); setCpseFilter(''); setStatusFilter('') }}
          >
            Clear filters
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-outline" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      {/* ── Status summary ── */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { dot: 'dot-neutral',  label: `${mappings.length} total` },
          { dot: 'dot-approved', label: `${approvedCount} approved` },
          { dot: 'dot-pending',  label: `${pendingCount} pending` },
          { dot: 'dot-rejected', label: `${rejectedCount > 0 ? rejectedCount + ' rejected' : 'None rejected yet'}` },
        ].map(({ dot, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`dot ${dot}`} />
            <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>{label}</span>
          </div>
        ))}
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', alignSelf: 'center', marginLeft: 4 }}>
          {filtered.length !== mappings.length ? `${filtered.length} shown` : ''}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          <table
            className="table-sticky-head"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-body)' }}
          >
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {hg.headers.map(h => (
                    <th
                      key={h.id}
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
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-body)' }}
                  >
                    {search || cpseFilter || statusFilter
                      ? 'No records match your filters. Try clearing them.'
                      : 'No mappings found. Run the clustering pipeline to generate mappings.'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{
                      borderTop: i > 0 ? '1px solid var(--color-border)' : undefined,
                      background: 'transparent',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-page)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
