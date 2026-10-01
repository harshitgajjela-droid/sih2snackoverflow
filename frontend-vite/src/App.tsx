import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, GitMerge, Table2 } from 'lucide-react'
import ExecutiveView from './views/ExecutiveView'
import ClusterReviewView from './views/ClusterReviewView'
import MappingView from './views/MappingView'

const NAV = [
  { to: '/',               label: 'Executive dashboard', icon: LayoutDashboard, end: true },
  { to: '/cluster-review', label: 'Cluster review',      icon: GitMerge },
  { to: '/mapping',        label: 'National material master', icon: Table2 },
]

export default function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-page)' }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <header style={{ background: '#0E1A2B' }}>
          {/* 3px tricolour stripe */}
          <div className="flex h-[3px]">
            <div className="flex-1" style={{ background: '#FF9933' }} />
            <div className="flex-1" style={{ background: '#FFFFFF' }} />
            <div className="flex-1" style={{ background: '#138808' }} />
          </div>

          <div className="max-w-screen-xl mx-auto px-6 py-0 flex items-stretch justify-between gap-8">
            {/* Brand */}
            <div className="flex items-center gap-3 py-3">
              <div>
                <p className="text-white font-semibold leading-tight" style={{ fontSize: 15 }}>
                  National Unified Material Master
                </p>
                <p style={{ fontSize: 11.5, color: '#8FAACC', marginTop: 1 }}>
                  One nation, one material code
                </p>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex items-stretch gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-1.5 px-3 text-sm font-semibold transition-colors relative',
                      isActive
                        ? 'text-white'
                        : 'text-[#8FAACC] hover:text-white',
                    ].join(' ')
                  }
                  style={({ isActive }) => isActive ? {
                    boxShadow: 'inset 0 -2px 0 #FFFFFF',
                  } : {}}
                >
                  <Icon size={15} strokeWidth={1.75} />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        {/* ── Page ───────────────────────────────────────────────── */}
        <main className="flex-1">
          <Routes>
            <Route path="/"               element={<ExecutiveView />} />
            <Route path="/cluster-review" element={<ClusterReviewView />} />
            <Route path="/mapping"        element={<MappingView />} />
          </Routes>
        </main>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <footer className="py-3 text-center" style={{ fontSize: 12, color: 'var(--color-text-tertiary)', borderTop: '1px solid var(--color-border)' }}>
          National Unified Material Master · Ministry of Heavy Industries, Government of India
        </footer>
      </div>
    </Router>
  )
}
