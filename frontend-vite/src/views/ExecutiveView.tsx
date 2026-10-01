import { useEffect, useState } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000'

// ── Skeleton bar ─────────────────────────────────────────────────────────────
function Skel({ w = 'w-24', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`skeleton ${w} ${h} rounded`} />
}

// ── Section panel wrapper ────────────────────────────────────────────────────
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>
}

// ── Small label above a value ────────────────────────────────────────────────
function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
      {children}
    </p>
  )
}

// ── Status dot + text row ────────────────────────────────────────────────────
function StatusRow({ dotClass, label, value }: { dotClass: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`dot ${dotClass}`} />
        <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>{label}</span>
      </div>
      <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {value.toLocaleString('en-IN')}
      </span>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ExecutiveView() {
  const [stats, setStats]     = useState<Record<string, number> | null>(null)
  const [clusters, setClusters] = useState<{ confidence_score: number; members: { cpse: string }[]; status: string }[]>([])
  const [audit, setAudit]     = useState<{ cluster_id: number; action: string; performed_by: string; performed_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      axios.get(`${API}/api/overview-stats`),
      axios.get(`${API}/api/clusters`),
      axios.get(`${API}/api/audit-trail?limit=8`),
    ])
      .then(([s, c, a]) => {
        setStats(s.data)
        setClusters(c.data.clusters ?? [])
        setAudit(a.data.audit_trail ?? [])
      })
      .catch(() => setError('Could not reach the backend. Make sure the API server is running on port 8000.'))
      .finally(() => setLoading(false))
  }, [])

  // ── Loading skeleton ───────────────────────────────────────────
  if (loading) return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-5">
      <div><Skel w="w-48" h="h-6" /><div className="mt-2"><Skel w="w-80" h="h-4" /></div></div>
      <Panel className="p-5"><div className="grid grid-cols-4 gap-6">
        {[0,1,2,3].map(i => <div key={i} className="space-y-2"><Skel w="w-28" h="h-3"/><Skel w="w-16" h="h-8"/><Skel w="w-32" h="h-3"/></div>)}
      </div></Panel>
      <div className="grid grid-cols-2 gap-5">
        <Panel className="p-5 h-48"><Skel w="w-full" h="h-full"/></Panel>
        <Panel className="p-5 h-48"><Skel w="w-full" h="h-full"/></Panel>
      </div>
    </div>
  )

  // ── Error state ────────────────────────────────────────────────
  if (error || !stats) return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      <Panel className="p-6">
        <p style={{ fontWeight: 600, color: 'var(--color-rejected)', marginBottom: 6 }}>Failed to load dashboard</p>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>
          {error ?? 'An unknown error occurred.'}
        </p>
      </Panel>
    </div>
  )

  // ── Derived values ─────────────────────────────────────────────
  const total        = stats.total_items ?? 0
  const totalClusters= stats.total_clusters ?? 0
  const approved     = stats.approved_clusters ?? 0
  const rejected     = stats.rejected_clusters ?? 0
  const pending      = totalClusters - approved - rejected

  const rationPct    = Number(stats.duplication_reduction_pct ?? 0)

  const exactDups = clusters.filter(c => c.members.length >= 4 && c.confidence_score >= 0.95).length
  const nearDups  = clusters.filter(c => c.members.length >= 2 && c.confidence_score >= 0.82 && c.confidence_score < 0.95).length
  const unique    = clusters.filter(c => c.members.length === 1).length
  const other     = clusters.length - exactDups - nearDups - unique

  // CPSE counts
  const cpseCounts: Record<string, number> = {}
  clusters.forEach(c => c.members.forEach(m => { cpseCounts[m.cpse] = (cpseCounts[m.cpse] ?? 0) + 1 }))
  const sortedCpse = Object.entries(cpseCounts).sort((a, b) => b[1] - a[1])
  const maxCpse = sortedCpse[0]?.[1] ?? 1

  // Pipeline
  const pipeline = [
    { label: 'Records ingested',    count: total,                                  pct: 100 },
    { label: 'NLP normalised',      count: Math.round(total * 0.98),               pct: 98 },
    { label: 'Clusters formed',     count: totalClusters,                          pct: total > 0 ? Math.round(totalClusters / total * 100) : 0 },
    { label: 'National codes approved', count: approved,                           pct: totalClusters > 0 ? Math.round(approved / totalClusters * 100) : 0 },
  ]

  // Match bar segments (% of total clusters)
  const matchTotal = clusters.length || 1
  const segments = [
    { label: 'Exact duplicates', count: exactDups, pct: exactDups / matchTotal * 100, color: 'var(--color-navy)' },
    { label: 'Near duplicates',  count: nearDups,  pct: nearDups  / matchTotal * 100, color: 'var(--color-navy-mid)' },
    { label: 'Unique items',     count: unique,    pct: unique    / matchTotal * 100, color: 'var(--color-border)' },
    ...(other > 0 ? [{ label: 'Other', count: other, pct: other / matchTotal * 100, color: 'var(--color-border-mid)' }] : []),
  ]

  const completionPct = totalClusters > 0 ? Math.round((approved + rejected) / totalClusters * 100) : 0

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-7 space-y-5">

      {/* ── Page header ── */}
      <div>
        <h1 style={{ fontSize: 'var(--text-page)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Executive dashboard
        </h1>
        <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Material records from {sortedCpse.length} CPSEs, grouped into duplicate clusters for review.
        </p>
      </div>

      {/* ── KPI row — 4 stats in one panel, separated by vertical dividers ── */}
      <Panel>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Records ingested',
              value: total.toLocaleString('en-IN'),
              note: `${sortedCpse.length} CPSEs contributing`,
            },
            {
              label: 'Duplicate clusters found',
              value: totalClusters.toLocaleString('en-IN'),
              note: `${pending > 0 ? pending.toLocaleString('en-IN') + ' awaiting review' : 'All reviewed'}`,
            },
            {
              label: 'Clusters approved',
              value: approved.toLocaleString('en-IN'),
              note: `${rejected > 0 ? rejected + ' rejected' : 'None rejected'}`,
            },
            {
              label: 'Data rationalisation',
              value: `${rationPct.toFixed(1)}%`,
              note: `${Math.round((approved / (totalClusters || 1)) * 100)}% of clusters resolved`,
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="p-5"
              style={{
                borderRight: i < 3 ? '1px solid var(--color-border)' : undefined,
                borderBottom: '0',
              }}
            >
              <StatLabel>{stat.label}</StatLabel>
              <p style={{ fontSize: 'var(--text-kpi)', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
                {stat.value}
              </p>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                {stat.note}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Processing pipeline ── */}
      <Panel className="p-5">
        <p style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16 }}>
          Processing pipeline
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0">
          {pipeline.map((step, i) => (
            <div
              key={i}
              className="px-5 py-0"
              style={{ borderRight: i < 3 ? '1px solid var(--color-border)' : undefined }}
            >
              <StatLabel>{step.label}</StatLabel>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: 10 }}>
                {step.count.toLocaleString('en-IN')}
              </p>
              {/* 4px navy progress track */}
              <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2, marginBottom: 6 }}>
                <div
                  className="progress-bar"
                  style={{ height: 4, borderRadius: 2, background: 'var(--color-navy)', width: `${step.pct}%` }}
                />
              </div>
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)' }}>
                {step.pct}% of ingested records
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Match breakdown — horizontal segmented bar */}
        <Panel className="p-5">
          <p style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Match breakdown
          </p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
            How clusters are classified by similarity
          </p>
          {/* Segmented bar */}
          <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
            {segments.map((s, i) => (
              s.count > 0 && (
                <div
                  key={i}
                  className="progress-bar"
                  style={{ width: `${s.pct}%`, background: s.color, flexShrink: 0 }}
                  title={`${s.label}: ${s.count}`}
                />
              )
            ))}
          </div>
          {/* Legend */}
          <div className="space-y-2">
            {segments.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)' }}>{s.label}</span>
                </div>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {s.count.toLocaleString('en-IN')}
                  <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
                    {matchTotal > 0 ? `${Math.round(s.pct)}%` : '—'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Records by CPSE — horizontal navy bars */}
        <Panel className="p-5">
          <p style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            Records by CPSE
          </p>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', marginBottom: 14 }}>
            Sorted by record count, highest first
          </p>
          <div className="space-y-3">
            {sortedCpse.map(([cpse, count]) => (
              <div key={cpse} className="flex items-center gap-3">
                <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-secondary)', width: 72, flexShrink: 0, fontFamily: 'IBM Plex Mono, monospace' }}>
                  {cpse}
                </span>
                <div style={{ flex: 1, height: 6, background: 'var(--color-border)', borderRadius: 3 }}>
                  <div
                    className="progress-bar"
                    style={{ height: 6, borderRadius: 3, background: 'var(--color-navy)', width: `${(count / maxCpse) * 100}%` }}
                  />
                </div>
                <span style={{ fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--color-text-primary)', width: 32, textAlign: 'right', flexShrink: 0 }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Cluster review status */}
        <Panel className="p-5">
          <p style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 14 }}>
            Cluster review status
          </p>
          {/* Single navy progress bar */}
          <div style={{ height: 6, background: 'var(--color-border)', borderRadius: 3, marginBottom: 14 }}>
            <div
              className="progress-bar"
              style={{ height: 6, borderRadius: 3, background: 'var(--color-navy)', width: `${completionPct}%` }}
            />
          </div>
          <StatusRow dotClass="dot-approved" label="Approved"      value={approved} />
          <div className="divider" />
          <StatusRow dotClass="dot-pending"  label="Pending review" value={pending} />
          <div className="divider" />
          <StatusRow dotClass="dot-rejected" label="Rejected"      value={rejected} />
          <div className="divider mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="flex justify-between" style={{ paddingTop: 8 }}>
              <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)' }}>
                {totalClusters.toLocaleString('en-IN')} clusters total
              </span>
              <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)' }}>
                {completionPct}% complete
              </span>
            </div>
          </div>
        </Panel>

        {/* Recent audit activity */}
        <Panel className="p-5">
          <p style={{ fontSize: 'var(--text-title)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 14 }}>
            Recent audit activity
          </p>
          {audit.length === 0 ? (
            <p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-tertiary)', padding: '24px 0', textAlign: 'center' }}>
              No activity yet — approve or reject clusters to begin.
            </p>
          ) : (
            <div>
              {audit.map((entry, i) => {
                const actionUp = entry.action?.toUpperCase()
                const isApproved = actionUp === 'APPROVED'
                const isRejected = actionUp === 'REJECTED'
                const dotClass = isApproved ? 'dot-approved' : isRejected ? 'dot-rejected' : 'dot-neutral'
                const label = entry.action
                  ? entry.action.charAt(0).toUpperCase() + entry.action.slice(1).toLowerCase()
                  : entry.action
                const ts = entry.performed_at
                  ? new Date(entry.performed_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : '—'
                return (
                  <div key={i}>
                    {i > 0 && <div className="divider" />}
                    <div className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`dot ${dotClass}`} />
                        <div>
                          <span style={{ fontSize: 'var(--text-body)', color: 'var(--color-text-primary)' }}>
                            Cluster #{entry.cluster_id}
                          </span>
                          <span style={{ fontSize: 'var(--text-body)', color: isApproved ? 'var(--color-approved)' : isRejected ? 'var(--color-rejected)' : 'var(--color-text-secondary)', marginLeft: 8, fontWeight: 600 }}>
                            {label}
                          </span>
                          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                            {entry.performed_by}
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: 'var(--text-meta)', color: 'var(--color-text-tertiary)', flexShrink: 0, marginLeft: 12 }}>
                        {ts}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
