import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const NAV_ITEMS = [
  { path: '/home',        label: 'Home',      icon: '🏠' },
  { path: '/cycles',      label: 'Ciclos',    icon: '🕊️' },
  { path: '/solo',        label: 'Solo',      icon: '⚡' },
  { path: '/puzzles',     label: 'Puzzles',   icon: '📚' },
  { path: '/vision',      label: 'Visión',    icon: '👁' },
  { path: '/history',     label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking',   icon: '🏆' },
  { path: '/blind',       label: 'Ciego',     icon: '🎲' },
  { path: '/openings',    label: 'Aperturas', icon: '♟' },
  { path: '/endings',     label: 'Finales',   icon: '♚' },
]

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

export default function Endings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [dark, setDark] = useState(true)
  const [tab, setTab] = useState<'teoria' | 'practica'>('teoria')
  const [chapters, setChapters] = useState<{ title: string; pgn: string }[]>([])
  const [practicePgn, setPracticePgn] = useState('')
  const [practiceChapters, setPracticeChapters] = useState<{ title: string; pgn: string }[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('wp_theme')
    if (saved) setDark(saved === 'dark')
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('wp_theme', next ? 'dark' : 'light')
  }

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetch('/endings.pgn').then(r => r.text()).then(text => {
      const parts = text.replace(/\r\n/g, '\n').split(/(?=\[Event )/).map(s => s.trim()).filter(Boolean)
      setChapters(parts.map(p => {
        const m = p.match(/\[SourceTitle "([^"]*)"\]/) || p.match(/\[White "([^"]*)"\]/)
        return { title: m ? m[1] : 'Capítulo', pgn: p }
      }))
    }).catch(() => {})
  }, [user, navigate])

  function parsePractice() {
    const parts = practicePgn.replace(/\r\n/g, '\n').split(/(?=\[Event )/).map(s => s.trim()).filter(Boolean)
    setPracticeChapters(parts.map(p => {
      const m = p.match(/\[SourceTitle "([^"]*)"\]/) || p.match(/\[White "([^"]*)"\]/)
      return { title: m ? m[1] : 'Capítulo', pgn: p }
    }))
  }

  const t = dark ? {
    bg: 'bg-[#0A0A0F]', bg2: 'bg-[#12121A]', bg3: 'bg-[#1C1C28]',
    border: 'border-[#1F1F2E]', borderLight: 'border-[#2A2A3A]',
    text: 'text-[#E8E6E0]', text2: 'text-[#B8B5AC]', text3: 'text-[#7A776E]',
    inputBg: 'bg-[#12121A] border-[#1F1F2E] text-[#E8E6E0]',
  } : {
    bg: 'bg-[#FAFAF7]', bg2: 'bg-[#F3EFE7]', bg3: 'bg-[#EDE8DF]',
    border: 'border-[#E5DFD5]', borderLight: 'border-[#D9D2C8]',
    text: 'text-[#1A1814]', text2: 'text-[#4A4640]', text3: 'text-[#8A8478]',
    inputBg: 'bg-[#F3EFE7] border-[#E5DFD5] text-[#1A1814]',
  }
  const accentColor = dark ? '#D4A017' : '#A07810'

  function Nav() {
    return (
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user?.nickname}</h1>
            </div>
            <button onClick={toggleTheme} className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}>
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {NAV_ITEMS.map((item, idx) => {
              const isActive = location.pathname === item.path
              return (
                <div key={item.path} className="flex items-center">
                  <button
                    onClick={() => navigate(item.path)}
                    className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all relative group ${isActive ? t.text : `${t.text2} hover:${t.text}`}`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="whitespace-nowrap">{item.label}</span>
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} style={{ backgroundColor: accentColor }} />
                  </button>
                  {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
                </div>
              )
            })}
          </div>
        </div>
      </nav>
    )
  }

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300 flex flex-col`}>
      <Nav />
      <div className="flex-1 px-6 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h2 className={`text-2xl font-bold mb-4 ${t.text}`}>♚ Finales</h2>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('teoria')} className={`px-4 py-2 rounded ${tab === 'teoria' ? 'text-black' : t.bg3}`} style={tab === 'teoria' ? { backgroundColor: accentColor } : {}}>{'Teoría'}</button>
          <button onClick={() => setTab('practica')} className={`px-4 py-2 rounded ${tab === 'practica' ? 'text-black' : t.bg3}`} style={tab === 'practica' ? { backgroundColor: accentColor } : {}}>{'Práctica'}</button>
        </div>
        {tab === 'teoria' && (
          <div className="space-y-4">
            {chapters.map((c, i) => (
              <details key={i} className={`${t.bg2} ${t.border} border rounded p-4`}>
                <summary className={`cursor-pointer font-semibold ${t.text}`}>{c.title}</summary>
                <pre className={`mt-3 whitespace-pre-wrap text-sm ${t.text2}`}>{c.pgn.replace(/\[[^\]]*\]/g, '').trim()}</pre>
              </details>
            ))}
          </div>
        )}
        {tab === 'practica' && (
          <div>
            <textarea value={practicePgn} onChange={e => setPracticePgn(e.target.value)} className={`w-full h-40 ${t.inputBg} border rounded p-3 text-sm`} placeholder="Pega aquí el PGN del workbook" />
            <button onClick={parsePractice} className="mt-2 px-4 py-2 rounded text-black" style={{ backgroundColor: accentColor }}>Cargar</button>
            <div className="mt-4 space-y-4">
              {practiceChapters.map((c, i) => (
                <details key={i} className={`${t.bg2} ${t.border} border rounded p-4`}>
                  <summary className={`cursor-pointer font-semibold ${t.text}`}>{c.title}</summary>
                  <pre className={`mt-3 whitespace-pre-wrap text-sm ${t.text2}`}>{c.pgn.replace(/\[[^\]]*\]/g, '').trim()}</pre>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
