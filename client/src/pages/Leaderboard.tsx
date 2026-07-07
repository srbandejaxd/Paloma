import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fetchBlocks, fetchLeaderboard, fetchVisionLeaderboard, LeaderboardEntry, VisionLeaderboardEntry } from '../lib/api'
import { Block } from '../types'

type Tab = 'puzzles' | 'vision'

interface RankingEntry extends LeaderboardEntry {
  rank: number
}

interface VisionRankingEntry extends VisionLeaderboardEntry {
  rank: number
}

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

function CrownIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 18h20l-1.5-9-4.5 3.5-4-6.5-4 6.5L3.5 9 2 18z"/>
    </svg>
  )
}

const CATEGORIES = [
  { id: "checkmate_patterns", label: "Checkmate Patterns Manual" },
  { id: "palomita", label: "Woodpecker Method" },
  { id: "woodpecker_method2", label: "Woodpecker Method 2" },
]

function formatMMSS(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Leaderboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('puzzles')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [visionRanking, setVisionRanking] = useState<VisionRankingEntry[]>([])
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(true)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [visionLoading, setVisionLoading] = useState(false)

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
    fetchBlocks().then(b => {
      setBlocks(b)
      setLoading(false)
    }).catch(console.error)
  }, [user, navigate])

  // Cargar ranking de puzzles cuando se selecciona bloque
  useEffect(() => {
    if (!selectedBlockId) { setRanking([]); return }
    setRankingLoading(true)
    fetchLeaderboard(selectedBlockId)
      .then((entries: LeaderboardEntry[]) => {
        setRanking(entries.map((e, i) => ({ ...e, rank: i + 1 })))
        setRankingLoading(false)
      })
      .catch((err: Error) => { console.error(err); setRankingLoading(false) })
  }, [selectedBlockId])

  // Cargar ranking de visión cuando se cambia a tab visión
  useEffect(() => {
    if (tab !== 'vision') return
    if (visionRanking.length > 0) return // ya cargado
    setVisionLoading(true)
    fetchVisionLeaderboard('coordinates')
      .then((entries: VisionLeaderboardEntry[]) => {
        setVisionRanking(entries.map((e, i) => ({ ...e, rank: i + 1 })))
        setVisionLoading(false)
      })
      .catch((err: Error) => { console.error(err); setVisionLoading(false) })
  }, [tab])

  const categories = CATEGORIES.filter(cat => blocks.some(b => b.category === cat.id))
  const blocksForCategory = selectedCategory ? blocks.filter(b => b.category === selectedCategory) : []
  const subcategoriesForCategory = selectedCategory
    ? [...new Set(blocksForCategory.map(b => b.subcategory).filter(Boolean))] as string[]
    : []
  const blocksToShow = selectedCategory
    ? selectedSubcategory
      ? blocksForCategory.filter(b => b.subcategory === selectedSubcategory)
      : blocksForCategory.filter(b => !b.subcategory)
    : []

  const t = dark ? {
    bg: 'bg-[#0A0A0F]', bg2: 'bg-[#12121A]', bg3: 'bg-[#1C1C28]',
    border: 'border-[#1F1F2E]', borderLight: 'border-[#2A2A3A]',
    text: 'text-[#E8E6E0]', text2: 'text-[#B8B5AC]', text3: 'text-[#7A776E]',
    accent: 'text-[#D4A017]', accentBg: 'bg-[#D4A017]',
    inputBg: 'bg-[#12121A] border-[#1F1F2E] focus:border-[#D4A017] text-[#E8E6E0]',
    track: 'bg-[#1F1F2E]',
  } : {
    bg: 'bg-[#FAFAF7]', bg2: 'bg-[#F3EFE7]', bg3: 'bg-[#EDE8DF]',
    border: 'border-[#E5DFD5]', borderLight: 'border-[#D9D2C8]',
    text: 'text-[#1A1814]', text2: 'text-[#4A4640]', text3: 'text-[#8A8478]',
    accent: 'text-[#A07810]', accentBg: 'bg-[#A07810]',
    inputBg: 'bg-[#F3EFE7] border-[#E5DFD5] focus:border-[#A07810] text-[#1A1814]',
    track: 'bg-[#E5DFD5]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'
  const NAV_ITEMS = [
    { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
    { path: '/solo', label: 'Solo', icon: '🪃' },
    { path: '/vision', label: 'Visión', icon: '👁' },
    { path: '/history', label: 'Historial', icon: '📋' },
    { path: '/blind', label: 'Ciego', icon: '🎲' },
  ]

  const selectedBlock = blocks.find(b => b.id === selectedBlockId)
  const top3 = ranking.slice(0, 3)
  const first = top3[0], second = top3[1], third = top3[2]

  const vTop3 = visionRanking.slice(0, 3)
  const vFirst = vTop3[0], vSecond = vTop3[1], vThird = vTop3[2]

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
        <p className={t.text3}>Cargando...</p>
      </div>
    )
  }

  // Componente de podio reutilizable
  function Podium({ f, s, th }: { f?: { nickname: string; value: string; sub: string }, s?: typeof f, th?: typeof f }) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-end mb-12 px-0 md:px-8">
        {/* 2do */}
        <div className="order-2 md:order-1">
          {s ? (
            <div className={`rounded-2xl ${t.bg2} border-t-4 p-6 flex flex-col items-center text-center relative h-56 justify-end transition-transform hover:-translate-y-1`} style={{ borderTopColor: '#C0C0C0' }}>
              <div className="absolute -top-8 w-16 h-16 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: dark ? '#0A0A0F' : '#FAFAF7', borderColor: '#C0C0C0', boxShadow: '0 0 15px rgba(192,192,192,0.3)' }}>
                <span className="text-xl font-bold" style={{ color: '#9CA3AF' }}>{s.nickname.charAt(0).toUpperCase()}</span>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2" style={{ backgroundColor: 'rgba(192,192,192,0.12)', color: '#9CA3AF' }}>2</div>
              <h3 className={`font-bold text-lg ${t.text} leading-tight truncate max-w-full`}>{s.nickname}</h3>
              <div className={`w-full ${t.bg3} rounded-lg p-2 mt-4`}>
                <div className="font-mono text-xl font-bold" style={{ color: '#9CA3AF' }}>{s.value}</div>
                <div className={`font-mono text-xs ${t.text3}`}>{s.sub}</div>
              </div>
            </div>
          ) : <div className="h-56" />}
        </div>
        {/* 1ro */}
        <div className="order-1 md:order-2">
          {f ? (
            <div className={`rounded-2xl ${t.bg2} border-t-4 p-6 flex flex-col items-center text-center relative h-64 justify-end transform md:-translate-y-4 z-10 transition-transform hover:-translate-y-1 md:hover:-translate-y-5`} style={{ boxShadow: '0 0 20px rgba(212,160,23,0.15)' }}>
              <div className="absolute -top-12 flex flex-col items-center">
                <span style={{ color: accentColor, filter: 'drop-shadow(0 0 8px rgba(212,160,23,0.8))' }} className="mb-1"><CrownIcon /></span>
                <div className="w-20 h-20 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: dark ? '#0A0A0F' : '#FAFAF7', borderColor: accentColor, boxShadow: '0 0 20px rgba(212,160,23,0.4)' }}>
                  <span className="text-2xl font-bold" style={{ color: accentColor }}>{f.nickname.charAt(0).toUpperCase()}</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2" style={{ backgroundColor: 'rgba(212,160,23,0.12)', color: accentColor }}>1</div>
              <h3 className="font-bold text-xl leading-tight truncate max-w-full" style={{ color: accentColor }}>{f.nickname}</h3>
              <div className="w-full rounded-lg p-3 mt-4 border" style={{ backgroundColor: 'rgba(212,160,23,0.1)', borderColor: 'rgba(212,160,23,0.2)' }}>
                <div className="font-mono text-2xl font-black" style={{ color: accentColor }}>{f.value}</div>
                <div className="font-mono text-sm opacity-80" style={{ color: accentColor }}>{f.sub}</div>
              </div>
            </div>
          ) : <div className="h-64" />}
        </div>
        {/* 3ro */}
        <div className="order-3">
          {th ? (
            <div className={`rounded-2xl ${t.bg2} border-t-4 p-6 flex flex-col items-center text-center relative h-52 justify-end transition-transform hover:-translate-y-1`} style={{ borderTopColor: '#CD7F32' }}>
              <div className="absolute -top-8 w-16 h-16 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: dark ? '#0A0A0F' : '#FAFAF7', borderColor: '#CD7F32', boxShadow: '0 0 15px rgba(205,127,50,0.3)' }}>
                <span className="text-xl font-bold" style={{ color: '#CD7F32' }}>{th.nickname.charAt(0).toUpperCase()}</span>
              </div>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2" style={{ backgroundColor: 'rgba(205,127,50,0.12)', color: '#CD7F32' }}>3</div>
              <h3 className={`font-bold text-lg ${t.text} leading-tight truncate max-w-full`}>{th.nickname}</h3>
              <div className={`w-full ${t.bg3} rounded-lg p-2 mt-4`}>
                <div className="font-mono text-xl font-bold" style={{ color: '#CD7F32' }}>{th.value}</div>
                <div className={`font-mono text-xs ${t.text3}`}>{th.sub}</div>
              </div>
            </div>
          ) : <div className="h-52" />}
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
      {/* Navbar */}
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user?.nickname}</h1>
            </div>
            <button onClick={toggleTheme} className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}>
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {NAV_ITEMS.map((item, idx) => (
              <div key={item.path} className="flex items-center">
                <button onClick={() => navigate(item.path)} className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all ${t.text2} hover:${t.text} relative group`}>
                  <span className="text-lg">{item.icon}</span>
                  <span className="whitespace-nowrap">{item.label}</span>
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 transition-all scale-x-0 group-hover:scale-x-100" style={{ backgroundColor: accentColor }} />
                </button>
                {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
              </div>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Clasificaciones</p>
          <h2 className={`text-5xl font-bold ${t.text} mb-8 leading-none`} style={{ letterSpacing: '-0.02em' }}>Ranking global</h2>

          {/* Tabs */}
          <div className={`inline-flex rounded-xl ${t.bg2} ${t.border} border p-1 gap-1`}>
            <button
              onClick={() => setTab('puzzles')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all`}
              style={tab === 'puzzles' ? { backgroundColor: accentColor, color: 'white' } : {}}
            >
              <span className={tab === 'puzzles' ? 'text-white' : t.text2}>🪃 Puzzles</span>
            </button>
            <button
              onClick={() => setTab('vision')}
              className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all`}
              style={tab === 'vision' ? { backgroundColor: accentColor, color: 'white' } : {}}
            >
              <span className={tab === 'vision' ? 'text-white' : t.text2}>👁 Visión</span>
            </button>
          </div>
        </div>

        {/* ── TAB PUZZLES ─────────────────────────────────────────────────────── */}
        {tab === 'puzzles' && (
          <>
            {/* Selectors */}
            <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-16`}>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Categoría</label>
                  <select
                    value={selectedCategory || ''}
                    onChange={(e) => { setSelectedCategory(e.target.value || null); setSelectedSubcategory(null); setSelectedBlockId(null) }}
                    className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold`}
                  >
                    <option value="">Elige una categoría...</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Subcategoría</label>
                  <select
                    value={selectedSubcategory || ''}
                    onChange={(e) => { setSelectedSubcategory(e.target.value || null); setSelectedBlockId(null) }}
                    disabled={!selectedCategory || subcategoriesForCategory.length === 0}
                    className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">{subcategoriesForCategory.length === 0 ? 'Sin subcategorías' : 'Elige una subcategoría...'}</option>
                    {subcategoriesForCategory.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Bloque</label>
                  <select
                    value={selectedBlockId || ''}
                    onChange={(e) => setSelectedBlockId(e.target.value ? Number(e.target.value) : null)}
                    disabled={!selectedCategory || blocksToShow.length === 0}
                    className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">{blocksToShow.length === 0 ? 'Sin bloques' : 'Elige un bloque...'}</option>
                    {blocksToShow.map(block => <option key={block.id} value={block.id}>{block.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {rankingLoading ? (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
                <p className={`text-lg ${t.text2}`}>Cargando ranking...</p>
              </div>
            ) : selectedBlockId && selectedBlock && ranking.length > 0 ? (
              <div>
                <div className="mb-12">
                  <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-2`}>{selectedBlock.name}</p>
                  <p className={`text-sm ${t.text2}`}>Score = 1000 × puzzles correctos − tiempo (segundos)</p>
                </div>

                <Podium
                  f={first ? { nickname: first.nickname, value: `${Math.round(first.bestScore).toLocaleString('en-US')} pts`, sub: formatMMSS(first.bestTimeMs) } : undefined}
                  s={second ? { nickname: second.nickname, value: `${Math.round(second.bestScore).toLocaleString('en-US')} pts`, sub: formatMMSS(second.bestTimeMs) } : undefined}
                  th={third ? { nickname: third.nickname, value: `${Math.round(third.bestScore).toLocaleString('en-US')} pts`, sub: formatMMSS(third.bestTimeMs) } : undefined}
                />

                <div className={`rounded-2xl ${t.bg2} ${t.border} border overflow-hidden`}>
                  <div className={`hidden md:grid grid-cols-[60px_1fr_120px_100px_100px] gap-4 px-6 py-4 ${t.bg3} border-b ${t.border} text-xs font-semibold ${t.text3} uppercase tracking-wider`}>
                    <div className="text-center">Rank</div>
                    <div>Jugador</div>
                    <div className="text-right">Score</div>
                    <div className="text-right">Mejor tiempo</div>
                    <div className="text-right">Puzzles</div>
                  </div>
                  <div className={`divide-y ${t.border}`}>
                    {ranking.map(player => {
                      const isMe = player.nickname === user?.nickname
                      return (
                        <div
                          key={`${player.nickname}-${player.rank}`}
                          className={`grid grid-cols-[60px_1fr_auto] md:grid-cols-[60px_1fr_120px_100px_100px] gap-4 px-6 py-4 items-center transition-colors ${isMe ? 'border-l-4' : `hover:${t.bg3}`}`}
                          style={isMe ? { backgroundColor: 'rgba(212,160,23,0.05)', borderLeftColor: accentColor } : {}}
                        >
                          <div className={`font-mono text-sm font-bold text-center ${t.text3}`} style={isMe ? { color: accentColor } : {}}>{player.rank}</div>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                              style={isMe ? { backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor } : { backgroundColor: dark ? '#1F1F2E' : '#E5DFD5', color: dark ? '#7A776E' : '#8A8478' }}>
                              {player.nickname.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className={`font-bold text-sm flex items-center gap-2 truncate ${t.text}`} style={isMe ? { color: accentColor } : {}}>
                                <span className="truncate">{player.nickname}</span>
                                {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor }}>Tú</span>}
                              </div>
                            </div>
                          </div>
                          <div className={`font-mono font-bold text-right ${t.text}`} style={isMe ? { color: accentColor } : {}}>{Math.round(player.bestScore).toLocaleString('en-US')}</div>
                          <div className={`hidden md:block font-mono text-sm ${t.text} text-right`}>{formatMMSS(player.bestTimeMs)}</div>
                          <div className={`hidden md:block font-mono text-sm ${t.text3} text-right`}>{player.bestSolved}/{player.totalPuzzles}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : selectedBlockId && selectedBlock && ranking.length === 0 ? (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
                <p className={`text-lg ${t.text2}`}>No hay datos para este bloque aún</p>
              </div>
            ) : (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
                <p className={`text-lg ${t.text2}`}>Elige una categoría y bloque para ver el ranking</p>
              </div>
            )}
          </>
        )}

        {/* ── TAB VISIÓN ──────────────────────────────────────────────────────── */}
        {tab === 'vision' && (
          <>
            <div className="mb-12">
              <p className={`text-sm ${t.text2} max-w-xl`}>
                Ranking del modo Coordenadas — 30 segundos, máxima cantidad de casillas correctas. Score = puntos totales.
              </p>
            </div>

            {visionLoading ? (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
                <p className={`text-lg ${t.text2}`}>Cargando ranking...</p>
              </div>
            ) : visionRanking.length > 0 ? (
              <div>
                <Podium
                  f={vFirst ? { nickname: vFirst.nickname, value: `${vFirst.bestScore} pts`, sub: `${vFirst.totalSessions} sesiones` } : undefined}
                  s={vSecond ? { nickname: vSecond.nickname, value: `${vSecond.bestScore} pts`, sub: `${vSecond.totalSessions} sesiones` } : undefined}
                  th={vThird ? { nickname: vThird.nickname, value: `${vThird.bestScore} pts`, sub: `${vThird.totalSessions} sesiones` } : undefined}
                />

                <div className={`rounded-2xl ${t.bg2} ${t.border} border overflow-hidden`}>
                  <div className={`hidden md:grid grid-cols-[60px_1fr_120px_100px_100px] gap-4 px-6 py-4 ${t.bg3} border-b ${t.border} text-xs font-semibold ${t.text3} uppercase tracking-wider`}>
                    <div className="text-center">Rank</div>
                    <div>Jugador</div>
                    <div className="text-right">Mejor score</div>
                    <div className="text-right">Sesiones</div>
                    <div className="text-right">Mejor errores</div>
                  </div>
                  <div className={`divide-y ${t.border}`}>
                    {visionRanking.map(player => {
                      const isMe = player.nickname === user?.nickname
                      return (
                        <div
                          key={`${player.nickname}-${player.rank}`}
                          className={`grid grid-cols-[60px_1fr_auto] md:grid-cols-[60px_1fr_120px_100px_100px] gap-4 px-6 py-4 items-center transition-colors ${isMe ? 'border-l-4' : `hover:${t.bg3}`}`}
                          style={isMe ? { backgroundColor: 'rgba(212,160,23,0.05)', borderLeftColor: accentColor } : {}}
                        >
                          <div className={`font-mono text-sm font-bold text-center ${t.text3}`} style={isMe ? { color: accentColor } : {}}>{player.rank}</div>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                              style={isMe ? { backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor } : { backgroundColor: dark ? '#1F1F2E' : '#E5DFD5', color: dark ? '#7A776E' : '#8A8478' }}>
                              {player.nickname.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className={`font-bold text-sm flex items-center gap-2 truncate ${t.text}`} style={isMe ? { color: accentColor } : {}}>
                                <span className="truncate">{player.nickname}</span>
                                {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor }}>Tú</span>}
                              </div>
                            </div>
                          </div>
                          <div className={`font-mono font-bold text-right`} style={{ color: accentColor }}>{player.bestScore}</div>
                          <div className={`hidden md:block font-mono text-sm ${t.text} text-right`}>{player.totalSessions}</div>
                          <div className={`hidden md:block font-mono text-sm ${t.text3} text-right`}>{player.bestErrors}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
                <p className={`text-lg ${t.text2}`}>No hay sesiones de Visión registradas aún</p>
                <p className={`text-sm ${t.text3} mt-2`}>Juega una partida en Visión para aparecer aquí</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className={`${t.bg2} ${t.border} border-t backdrop-blur-xl mt-16`}>
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className={`text-sm ${t.text3}`}>
            {tab === 'puzzles' ? 'Score = 1000×N correctos − tiempo(segundos)' : 'Visión · Coordenadas · 30 segundos'}
          </p>
          <button onClick={logout} className={`px-5 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-medium transition-all ${t.text3} hover:${t.text}`}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
