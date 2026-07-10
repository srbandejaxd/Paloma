import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fetchBlocks, fetchLeaderboard, LeaderboardEntry, fetchVisionLeaderboard, VisionLeaderboardEntry } from '../lib/api'
import { Block } from '../types'

interface RankingEntry extends LeaderboardEntry {
  rank: number
}

interface VisionRankingEntry extends VisionLeaderboardEntry {
  rank: number
}

type Tab = 'puzzles' | 'vision'

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
  { id: "checkmate_patterns", label: "The Checkmate Patterns Manual" },
  { id: "palomita", label: "Woodpecker Method" },
  { id: "woodpecker_method2", label: "Woodpecker Method 2" },
  { id: "patterns_must_know", label: "Los 100 patrones que debes saber" },
]

const NAV_ITEMS = [
  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
  { path: '/solo', label: 'Solo', icon: '🪃' },
  { path: '/vision', label: 'Visión', icon: '👁' },
  { path: '/history', label: 'Historial', icon: '📋' },
  { path: '/blind', label: 'Ciego', icon: '🎲' },
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
  const [searchParams] = useSearchParams()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [visionLeaderboard, setVisionLeaderboard] = useState<VisionRankingEntry[]>([])
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(true)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [visionLoading, setVisionLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('puzzles')

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
      const blockIdParam = searchParams.get('blockId')
      if (blockIdParam) {
        const bid = parseInt(blockIdParam)
        const block = b.find(x => x.id === bid)
        if (block) {
          setSelectedCategory(block.category)
          setSelectedSubcategory(block.subcategory || null)
          setSelectedBlockId(bid)
        }
      }
      setLoading(false)
    }).catch(console.error)
  }, [user, navigate, searchParams])

  const blocksForCategory = blocks.filter(b => b.category === selectedCategory)
  const subcategoriesForCategory = [...new Set(blocksForCategory.map(b => b.subcategory).filter(Boolean))] as string[]
  const hasSubcategories = subcategoriesForCategory.length > 0
  const blocksToShow = selectedCategory
    ? hasSubcategories
      ? (selectedSubcategory ? blocksForCategory.filter(b => b.subcategory === selectedSubcategory) : [])
      : blocksForCategory
    : []

  const selectedBlock = blocks.find(b => b.id === selectedBlockId)

  // Cargar ranking cuando bloque cambia
  useEffect(() => {
    if (!selectedBlockId) {
      setRanking([])
      return
    }
    setRankingLoading(true)
    fetchLeaderboard(selectedBlockId)
      .then((entries: LeaderboardEntry[]) => {
        const rankingData: RankingEntry[] = entries.map((entry, idx) => ({
          ...entry,
          rank: idx + 1,
        }))
        setRanking(rankingData)
        setRankingLoading(false)
      })
      .catch((err: Error) => {
        console.error('Error loading leaderboard:', err)
        setRankingLoading(false)
      })
  }, [selectedBlockId])

  // Cargar leaderboard de Vision cuando el tab cambia
  useEffect(() => {
    if (tab !== 'vision') return
    if (visionLeaderboard.length > 0) return
    setVisionLoading(true)
    fetchVisionLeaderboard('coordinates')
      .then((entries) => {
        const rankingData: VisionRankingEntry[] = entries.map((entry, idx) => ({
          ...entry,
          rank: idx + 1,
        }))
        setVisionLeaderboard(rankingData)
        setVisionLoading(false)
      })
      .catch((err: Error) => {
        console.error('Error loading vision leaderboard:', err)
        setVisionLoading(false)
      })
  }, [tab, visionLeaderboard.length])

  const t = dark ? {
    bg: 'bg-[#0A0A0F]',
    bg2: 'bg-[#12121A]',
    bg3: 'bg-[#1C1C28]',
    border: 'border-[#1F1F2E]',
    borderLight: 'border-[#2A2A3A]',
    text: 'text-[#E8E6E0]',
    text2: 'text-[#B8B5AC]',
    text3: 'text-[#7A776E]',
    accent: 'text-[#D4A017]',
    accentBg: 'bg-[#D4A017]',
    inputBg: 'bg-[#12121A] border-[#1F1F2E] focus:border-[#D4A017] text-[#E8E6E0]',
    track: 'bg-[#1F1F2E]',
  } : {
    bg: 'bg-[#FAFAF7]',
    bg2: 'bg-[#F3EFE7]',
    bg3: 'bg-[#EDE8DF]',
    border: 'border-[#E5DFD5]',
    borderLight: 'border-[#D9D2C8]',
    text: 'text-[#1A1814]',
    text2: 'text-[#4A4640]',
    text3: 'text-[#8A8478]',
    accent: 'text-[#A07810]',
    accentBg: 'bg-[#A07810]',
    inputBg: 'bg-[#F3EFE7] border-[#E5DFD5] focus:border-[#A07810] text-[#1A1814]',
    track: 'bg-[#E5DFD5]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
        <p className={t.text3}>Cargando bloques...</p>
      </div>
    )
  }

  const top3 = ranking.slice(0, 3)
  const rest = ranking.slice(3)
  const first = top3[0]
  const second = top3[1]
  const third = top3[2]

  return (
    <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
      {/* Navbar */}
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>
                {user?.nickname}
              </h1>
            </div>
            <button
              onClick={toggleTheme}
              className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3} hover:${t.text}`}
              title={dark ? 'Tema claro' : 'Tema oscuro'}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>

          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {NAV_ITEMS.map((item, idx) => (
              <div key={item.path} className="flex items-center">
                <button
                  onClick={() => navigate(item.path)}
                  className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all ${t.text2} hover:${t.text} relative group`}
                >
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
        <div className="mb-12 animate-slide-up">
          <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Clasificaciones</p>
          <h2 className={`text-5xl font-bold ${t.text} mb-4 leading-none`} style={{ letterSpacing: '-0.02em' }}>
            {tab === 'puzzles' ? 'Ranking por bloque' : 'Ranking de Visión'}
          </h2>
          <p className={`text-lg max-w-2xl ${t.text2} leading-relaxed`}>
            {tab === 'puzzles' 
              ? 'Selecciona una categoría, subcategoría y bloque para ver el ranking global de ese bloque.'
              : 'Ranking global de los jugadores en modo Visión - Coordinadas'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 animate-slide-up">
          <button
            onClick={() => setTab('puzzles')}
            className={`px-6 py-3 rounded-lg font-semibold text-sm uppercase tracking-widest transition-all ${
              tab === 'puzzles'
                ? 'text-white'
                : `${t.bg2} ${t.border} border ${t.text2} hover:${t.text}`
            }`}
            style={tab === 'puzzles' ? { backgroundColor: accentColor } : {}}
          >
            ⚡ Puzzles
          </button>
          <button
            onClick={() => setTab('vision')}
            className={`px-6 py-3 rounded-lg font-semibold text-sm uppercase tracking-widest transition-all ${
              tab === 'vision'
                ? 'text-white'
                : `${t.bg2} ${t.border} border ${t.text2} hover:${t.text}`
            }`}
            style={tab === 'vision' ? { backgroundColor: accentColor } : {}}
          >
            👁 Visión
          </button>
        </div>

        {/* Puzzles Tab */}
        {tab === 'puzzles' && (
          <>
            {/* Selectors Section */}
            <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-16 animate-slide-up`}>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Categoría</label>
                  <select
                    value={selectedCategory || ''}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value || null)
                      setSelectedSubcategory(null)
                      setSelectedBlockId(null)
                    }}
                    className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold`}
                  >
                    <option value="">Elige una categoría...</option>
                    {CATEGORIES.filter(cat => blocks.some(b => b.category === cat.id)).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Subcategoría</label>
                  <select
                    value={selectedSubcategory || ''}
                    onChange={(e) => {
                      setSelectedSubcategory(e.target.value || null)
                      setSelectedBlockId(null)
                    }}
                    disabled={!selectedCategory || !hasSubcategories}
                    className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">{!hasSubcategories ? 'Sin subcategorías' : 'Elige una subcategoría...'}</option>
                    {subcategoriesForCategory.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Bloque</label>
                  <select
                    value={selectedBlockId || ''}
                    onChange={(e) => e.target.value && setSelectedBlockId(Number(e.target.value))}
                    disabled={!selectedCategory || blocksToShow.length === 0}
                    className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">{blocksToShow.length === 0 ? 'Sin bloques' : 'Elige un bloque...'}</option>
                    {blocksToShow.map(block => (
                      <option key={block.id} value={block.id}>{block.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Ranking Section */}
            {rankingLoading ? (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border animate-slide-up`}>
                <p className={`text-lg ${t.text2}`}>Cargando ranking...</p>
              </div>
            ) : selectedBlockId && selectedBlock && ranking.length > 0 ? (
              <div className="animate-slide-up">
                <div className="mb-12">
                  <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>{selectedBlock.name}</p>
                  <h3 className={`text-3xl font-bold ${t.text} leading-none mb-2`} style={{ letterSpacing: '-0.02em' }}>Top ranking</h3>
                  <p className={`text-sm ${t.text2}`}>Score = 1000×N puzzles − tiempo (segundos)</p>
                </div>

                {/* PODIO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-end mb-12 px-0 md:px-8">
                  {/* 2do lugar */}
                  <div className="order-2 md:order-1">
                    {second ? (
                      <div className={`rounded-2xl ${t.bg2} border-t-4 p-6 flex flex-col items-center text-center relative h-56 justify-end transition-transform hover:-translate-y-1`} style={{ borderTopColor: '#C0C0C0' }}>
                        <div className="absolute -top-8 w-16 h-16 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: dark ? '#0A0A0F' : '#FAFAF7', borderColor: '#C0C0C0', boxShadow: '0 0 15px rgba(192,192,192,0.3)' }}>
                          <span className="text-xl font-bold" style={{ color: '#9CA3AF' }}>{second.nickname.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2" style={{ backgroundColor: 'rgba(192,192,192,0.12)', color: '#9CA3AF' }}>2</div>
                        <h3 className={`font-bold text-lg ${t.text} leading-tight truncate max-w-full`}>{second.nickname}</h3>
                        <div className={`w-full ${t.bg3} rounded-lg p-2 mt-4`}>
                          <div className="font-mono text-xl font-bold" style={{ color: '#9CA3AF' }}>
                            {Math.round(second.bestScore).toLocaleString('en-US')} <span className={`text-xs font-sans font-normal ${t.text3}`}>pts</span>
                          </div>
                          <div className={`font-mono text-xs ${t.text3}`}>{formatMMSS(second.bestTimeMs)} min</div>
                        </div>
                      </div>
                    ) : <div className="h-56" />}
                  </div>

                  {/* 1er lugar */}
                  <div className="order-1 md:order-2">
                    {first ? (
                      <div className={`rounded-2xl ${t.bg2} border-t-4 border-amber p-6 flex flex-col items-center text-center relative h-64 justify-end transform md:-translate-y-4 z-10 transition-transform hover:-translate-y-1 md:hover:-translate-y-5`} style={{ boxShadow: '0 0 20px rgba(212,160,23,0.15)' }}>
                        <div className="absolute -top-12 flex flex-col items-center">
                          <span style={{ color: accentColor, filter: 'drop-shadow(0 0 8px rgba(212,160,23,0.8))' }} className="mb-1">
                            <CrownIcon />
                          </span>
                          <div className="w-20 h-20 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: dark ? '#0A0A0F' : '#FAFAF7', borderColor: accentColor, boxShadow: '0 0 20px rgba(212,160,23,0.4)' }}>
                            <span className="text-2xl font-bold" style={{ color: accentColor }}>{first.nickname.charAt(0).toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2" style={{ backgroundColor: 'rgba(212,160,23,0.12)', color: accentColor }}>1</div>
                        <h3 className="font-bold text-xl leading-tight truncate max-w-full" style={{ color: accentColor }}>{first.nickname}</h3>
                        <div className="w-full rounded-lg p-3 mt-4 border" style={{ backgroundColor: 'rgba(212,160,23,0.1)', borderColor: 'rgba(212,160,23,0.2)' }}>
                          <div className="font-mono text-2xl font-black" style={{ color: accentColor }}>
                            {Math.round(first.bestScore).toLocaleString('en-US')} <span className="text-xs font-sans font-normal opacity-70">pts</span>
                          </div>
                          <div className="font-mono text-sm opacity-80" style={{ color: accentColor }}>{formatMMSS(first.bestTimeMs)} min</div>
                        </div>
                      </div>
                    ) : <div className="h-64" />}
                  </div>

                  {/* 3er lugar */}
                  <div className="order-3 md:order-3">
                    {third ? (
                      <div className={`rounded-2xl ${t.bg2} border-t-4 p-6 flex flex-col items-center text-center relative h-52 justify-end transition-transform hover:-translate-y-1`} style={{ borderTopColor: '#CD7F32' }}>
                        <div className="absolute -top-8 w-16 h-16 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: dark ? '#0A0A0F' : '#FAFAF7', borderColor: '#CD7F32', boxShadow: '0 0 15px rgba(205,127,50,0.3)' }}>
                          <span className="text-xl font-bold" style={{ color: '#CD7F32' }}>{third.nickname.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold mb-2" style={{ backgroundColor: 'rgba(205,127,50,0.12)', color: '#CD7F32' }}>3</div>
                        <h3 className={`font-bold text-lg ${t.text} leading-tight truncate max-w-full`}>{third.nickname}</h3>
                        <div className={`w-full ${t.bg3} rounded-lg p-2 mt-4`}>
                          <div className="font-mono text-xl font-bold" style={{ color: '#CD7F32' }}>
                            {Math.round(third.bestScore).toLocaleString('en-US')} <span className={`text-xs font-sans font-normal ${t.text3}`}>pts</span>
                          </div>
                          <div className={`font-mono text-xs ${t.text3}`}>{formatMMSS(third.bestTimeMs)} min</div>
                        </div>
                      </div>
                    ) : <div className="h-52" />}
                  </div>
                </div>

                {/* TABLA */}
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
                      const isCurrentUser = player.nickname === user?.nickname
                      return (
                        <div key={`${player.nickname}-${player.rank}`} className={`grid grid-cols-[60px_1fr_auto] md:grid-cols-[60px_1fr_120px_100px_100px] gap-4 px-6 py-4 items-center transition-colors relative ${isCurrentUser ? 'border-l-4' : `hover:${t.bg3}`}`} style={isCurrentUser ? { backgroundColor: 'rgba(212,160,23,0.05)', borderLeftColor: accentColor } : {}}>
                          <div className={`font-mono text-sm font-bold text-center ${isCurrentUser ? '' : t.text3}`} style={isCurrentUser ? { color: accentColor } : {}}>{player.rank}</div>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0" style={isCurrentUser ? { backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor } : { backgroundColor: dark ? '#1F1F2E' : '#E5DFD5', color: dark ? '#7A776E' : '#8A8478' }}>
                              {player.nickname.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className={`font-bold text-sm flex items-center gap-2 truncate ${isCurrentUser ? '' : t.text}`} style={isCurrentUser ? { color: accentColor } : {}}>
                                <span className="truncate">{player.nickname}</span>
                                {isCurrentUser && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor }}>
                                    Tú
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className={`font-mono font-bold text-right text-base md:text-sm ${isCurrentUser ? '' : t.text}`} style={isCurrentUser ? { color: accentColor } : {}}>
                            {Math.round(player.bestScore).toLocaleString('en-US')} <span className={`md:hidden text-xs ${t.text3}`}>pts</span>
                          </div>
                          <div className={`hidden md:block font-mono text-sm ${t.text} text-right`}>{formatMMSS(player.bestTimeMs)}</div>
                          <div className={`hidden md:block font-mono text-sm ${t.text3} text-right`}>{player.bestSolved}/{player.totalPuzzles}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : selectedBlockId && selectedBlock && ranking.length === 0 ? (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border animate-slide-up`}>
                <p className={`text-lg ${t.text2}`}>No hay datos de intentos para este bloque aún</p>
                <p className={`text-sm ${t.text3} mt-2`}>Completa algunos cycles para ver el ranking</p>
              </div>
            ) : null}
          </>
        )}

        {/* Vision Tab */}
        {tab === 'vision' && (
          <>
            {visionLoading ? (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border animate-slide-up`}>
                <p className={`text-lg ${t.text2}`}>Cargando ranking de visión...</p>
              </div>
            ) : visionLeaderboard.length > 0 ? (
              <div className={`rounded-2xl ${t.bg2} ${t.border} border overflow-hidden animate-slide-up`}>
                <div className={`hidden md:grid grid-cols-[60px_1fr_120px_100px] gap-4 px-6 py-4 ${t.bg3} border-b ${t.border} text-xs font-semibold ${t.text3} uppercase tracking-wider`}>
                  <div className="text-center">Rank</div>
                  <div>Jugador</div>
                  <div className="text-right">Mejor Score</div>
                  <div className="text-right">Sesiones</div>
                </div>

                <div className={`divide-y ${t.border}`}>
                  {visionLeaderboard.map(player => {
                    const isCurrentUser = player.nickname === user?.nickname
                    return (
                      <div key={`${player.nickname}-${player.rank}`} className={`grid grid-cols-[60px_1fr_auto] md:grid-cols-[60px_1fr_120px_100px] gap-4 px-6 py-4 items-center transition-colors relative ${isCurrentUser ? 'border-l-4' : `hover:${t.bg3}`}`} style={isCurrentUser ? { backgroundColor: 'rgba(212,160,23,0.05)', borderLeftColor: accentColor } : {}}>
                        <div className={`font-mono text-sm font-bold text-center ${isCurrentUser ? '' : t.text3}`} style={isCurrentUser ? { color: accentColor } : {}}>{player.rank}</div>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0" style={isCurrentUser ? { backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor } : { backgroundColor: dark ? '#1F1F2E' : '#E5DFD5', color: dark ? '#7A776E' : '#8A8478' }}>
                            {player.nickname.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className={`font-bold text-sm flex items-center gap-2 truncate ${isCurrentUser ? '' : t.text}`} style={isCurrentUser ? { color: accentColor } : {}}>
                              <span className="truncate">{player.nickname}</span>
                              {isCurrentUser && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold flex-shrink-0" style={{ backgroundColor: 'rgba(212,160,23,0.2)', color: accentColor }}>
                                  Tú
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`font-mono font-bold text-right text-base md:text-sm ${isCurrentUser ? '' : t.text}`} style={isCurrentUser ? { color: accentColor } : {}}>
                          {Math.round(player.bestScore).toLocaleString('en-US')}
                        </div>
                        <div className={`hidden md:block font-mono text-sm ${t.text} text-right`}>{player.totalSessions}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border animate-slide-up`}>
                <p className={`text-lg ${t.text2}`}>No hay datos de visión aún</p>
                <p className={`text-sm ${t.text3} mt-2`}>Completa sesiones de visión para ver el ranking</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className={`${t.bg2} ${t.border} border-t backdrop-blur-xl`}>
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className={`text-sm ${t.text3}`}>Score = 1000×N - tiempo(segundos)</p>
          <button
            onClick={logout}
            className={`px-5 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-medium transition-all ${t.text3} hover:${t.text}`}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
