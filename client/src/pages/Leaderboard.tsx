import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fetchBlocks, fetchAttempts } from '../lib/api'
import { Block, AttemptRecord } from '../types'

interface RankingEntry {
  nickname: string
  userId: number
  bestScore: number
  bestTime: number
  attempts: number
  averageAccuracy: number
  errors: number
  solved: number
  totalPuzzles: number
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

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
      <path d="M3 20h18" />
    </svg>
  )
}

const CATEGORIES = [
  { id: "checkmate_patterns", label: "Checkmate Patterns Manual" },
  { id: "palomita", label: "Woodpecker Method" },
  { id: "woodpecker_method2", label: "Woodpecker Method 2" },
]

export default function Leaderboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    if (!selectedBlockId) {
      setRanking([])
      return
    }
    
    setLoading(true)
    fetchAttempts(selectedBlockId)
      .then((attempts: AttemptRecord[]) => {
        const selectedBlock = blocks.find(b => b.id === selectedBlockId)
        if (!selectedBlock) return

        const userMap = new Map<number, { nickname: string; attempts: AttemptRecord[] }>()
        
        attempts.forEach((attempt: AttemptRecord) => {
          // NOTA DIAGNÓSTICA PARA EL BUG: 
          // Si attempt.userId viene undefined o null de tu API, todos los jugadores colapsarán en el ID 0.
          // Asegúrate de que tu endpoint devuelva datos globales de todos los usuarios y contenga IDs únicos.
          const userId = attempt.userId || attempt.id || Math.random() 
          if (!userMap.has(userId)) {
            userMap.set(userId, { nickname: attempt.nickname || 'Anónimo', attempts: [] })
          }
          userMap.get(userId)!.attempts.push(attempt)
        })

        const rankingData: RankingEntry[] = Array.from(userMap.entries()).map(([userId, data]) => {
          const N = selectedBlock.puzzleCount
          
          const best = data.attempts.reduce((prev, current) => {
            const prevScore = 1000 * N - (prev.totalTimeMs / 1000)
            const currentScore = 1000 * N - (current.totalTimeMs / 1000)
            return currentScore > prevScore ? current : prev
          })

          const bestScore = 1000 * N - (best.totalTimeMs / 1000)

          return {
            nickname: data.nickname,
            userId,
            bestScore,
            bestTime: best.totalTimeMs / 1000,
            attempts: data.attempts.length,
            averageAccuracy: best.accuracy,
            errors: best.errors,
            solved: best.solved,
            totalPuzzles: best.totalPuzzles,
            rank: 0
          }
        })

        rankingData.sort((a, b) => b.bestScore - a.bestScore)
        rankingData.forEach((entry, idx) => {
          entry.rank = idx + 1
        })

        setRanking(rankingData)
        setLoading(false)
      })
      .catch((err: Error) => {
        console.error('Error loading attempts:', err)
        setLoading(false)
      })
  }, [selectedBlockId, blocks])

  // ── THEME TOKENS ────────────────────────────────────────────────────────────
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
  const NAV_ITEMS = [
    { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
    { path: '/solo', label: 'Solo', icon: '🪃' },
    { path: '/vision', label: 'Visión', icon: '👁' },
    { path: '/history', label: 'Historial', icon: '📋' },
    { path: '/blind', label: 'Ciego', icon: '🎲' },
  ]

  const top3 = ranking.slice(0, 3)
  const rest = ranking.slice(3)
  const selectedBlock = blocks.find(b => b.id === selectedBlockId)

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
        <p className={t.text3}>Cargando bloques...</p>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
      {/* Navbar Profesional */}
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
                  <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all scale-x-0 group-hover:scale-x-100`} style={{ backgroundColor: accentColor }} />
                </button>
                {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12 animate-slide-up">
          <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Clasificaciones</p>
          <h2 className={`text-5xl font-bold ${t.text} mb-4 leading-none`} style={{ letterSpacing: '-0.02em' }}>
            Ranking por bloque
          </h2>
          <p className={`text-lg max-w-2xl ${t.text2} leading-relaxed`}>
            Selecciona una categoría, subcategoría y bloque para ver el ranking de ese bloque específico.
          </p>
        </div>

        {/* Selectors Section (Drop System mantenido intacto) */}
        <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-16 animate-slide-up`}>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                Categoría
              </label>
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
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                Subcategoría
              </label>
              <select
                value={selectedSubcategory || ''}
                onChange={(e) => {
                  setSelectedSubcategory(e.target.value || null)
                  setSelectedBlockId(null)
                }}
                disabled={!selectedCategory || subcategoriesForCategory.length === 0}
                className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">
                  {subcategoriesForCategory.length === 0 ? 'Sin subcategorías' : 'Elige una subcategoría...'}
                </option>
                {subcategoriesForCategory.map(sub => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                Bloque
              </label>
              <select
                value={selectedBlockId || ''}
                onChange={(e) => setSelectedBlockId(e.target.value ? Number(e.target.value) : null)}
                disabled={!selectedCategory || blocksToShow.length === 0}
                className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">
                  {blocksToShow.length === 0 ? 'Sin bloques' : 'Elige un bloque...'}
                </option>
                {blocksToShow.map(block => (
                  <option key={block.id} value={block.id}>
                    {block.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ranking Section */}
        {selectedBlockId && selectedBlock && ranking.length > 0 ? (
          <div className="animate-slide-up">
            <div className="mb-12">
              <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>{selectedBlock.name}</p>
              <h3 className={`text-3xl font-bold ${t.text} leading-none mb-2`} style={{ letterSpacing: '-0.02em' }}>
                Top ranking
              </h3>
              <p className={`text-sm ${t.text2}`}>Formula: score = 1000×N - tiempo(segundos)</p>
            </div>

            {/* NUEVO PODIO INTERACTIVO STYLE SAAS (Mapeado Dinámico) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mt-12 px-2 mb-16">
              
              {/* Plata (Posición 2) */}
              {top3[1] && (
                <div className={`group relative rounded-2xl p-6 flex flex-col items-center text-center border h-64 justify-end order-2 md:order-1 transition-all hover:-translate-y-1 ${t.bg2} ${t.border} border-t-4`} style={{ borderTopColor: '#C0C0C0' }}>
                  <div className={`absolute -top-8 w-16 h-16 rounded-full ${t.bg} border-2 flex items-center justify-center font-bold text-xl shadow-md`} style={{ borderColor: '#C0C0C0', color: '#C0C0C0' }}>
                    {top3[1].nickname.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-opacity-10 flex items-center justify-center text-xs font-bold mb-2" style={{ backgroundColor: '#C0C0C0', color: '#C0C0C0' }}>2</div>
                  <h3 className={`font-bold text-lg ${t.text} truncate max-w-full`}>{top3[1].nickname}</h3>
                  
                  <div className={`w-full ${t.bg3} rounded-xl p-3 mt-4`}>
                    <div className="font-mono text-xl font-bold" style={{ color: '#C0C0C0' }}>
                      {Math.round(top3[1].bestScore)} <span className={`text-xs font-sans font-normal ${t.text3}`}>pts</span>
                    </div>
                    <div className={`font-mono text-xs ${t.text2} mt-1`}>⏱ {top3[1].bestTime.toFixed(1)}s | ❌ {top3[1].errors}</div>
                  </div>
                </div>
              )}

              {/* Oro (Posición 1) */}
              {top3[0] && (
                <div className={`group relative rounded-2xl p-6 flex flex-col items-center text-center border h-72 justify-end order-1 md:order-2 transform md:-translate-y-4 shadow-xl z-10 transition-all hover:-translate-y-5 ${t.bg2} ${t.border} border-t-4`} style={{ borderTopColor: '#FFD700' }}>
                  <div className="absolute -top-12 flex flex-col items-center">
                    <CrownIcon className="text-gold mb-1 filter drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" style={{ color: '#FFD700' }} />
                    <div className={`w-20 h-20 rounded-full ${t.bg} border-2 flex items-center justify-center font-bold text-2xl shadow-lg`} style={{ borderColor: '#FFD700', color: '#FFD700' }}>
                      {top3[0].nickname.substring(0, 2).toUpperCase()}
                    </div>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-opacity-10 flex items-center justify-center text-xs font-bold mb-2" style={{ backgroundColor: '#FFD700', color: '#FFD700' }}>1</div>
                  <h3 className={`font-bold text-xl ${t.text} truncate max-w-full`}>{top3[0].nickname}</h3>
                  
                  <div className={`w-full rounded-xl p-3 mt-4 border`} style={{ backgroundColor: dark ? '#1C1C28' : '#EDE8DF', borderColor: `${accentColor}30` }}>
                    <div className="font-mono text-2xl font-black" style={{ color: '#FFD700' }}>
                      {Math.round(top3[0].bestScore)} <span className={`text-xs font-sans font-normal ${t.text2}`}>pts</span>
                    </div>
                    <div className={`font-mono text-xs mt-1`} style={{ color: accentColor }}>⏱ {top3[0].bestTime.toFixed(1)}s | ❌ {top3[0].errors}</div>
                  </div>
                </div>
              )}

              {/* Bronce (Posición 3) */}
              {top3[2] && (
                <div className={`group relative rounded-2xl p-6 flex flex-col items-center text-center border h-56 justify-end order-3 md:order-3 transition-all hover:-translate-y-1 ${t.bg2} ${t.border} border-t-4`} style={{ borderTopColor: '#CD7F32' }}>
                  <div className={`absolute -top-8 w-16 h-16 rounded-full ${t.bg} border-2 flex items-center justify-center font-bold text-xl shadow-md`} style={{ borderColor: '#CD7F32', color: '#CD7F32' }}>
                    {top3[2].nickname.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-opacity-10 flex items-center justify-center text-xs font-bold mb-2" style={{ backgroundColor: '#CD7F32', color: '#CD7F32' }}>3</div>
                  <h3 className={`font-bold text-lg ${t.text} truncate max-w-full`}>{top3[2].nickname}</h3>
                  
                  <div className={`w-full ${t.bg3} rounded-xl p-3 mt-4`}>
                    <div className="font-mono text-xl font-bold" style={{ color: '#CD7F32' }}>
                      {Math.round(top3[2].bestScore)} <span className={`text-xs font-sans font-normal ${t.text3}`}>pts</span>
                    </div>
                    <div className={`font-mono text-xs ${t.text2} mt-1`}>⏱ {top3[2].bestTime.toFixed(1)}s | ❌ {top3[2].errors}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Separador */}
            {rest.length > 0 && <div className={`h-px ${t.track} my-16`} />}

            {/* Resto del ranking optimizado (Lista de jugadores sin texto de intentos) */}
            {rest.length > 0 && (
              <div className="mb-20">
                <div className="mb-8">
                  <h3 className={`text-2xl font-bold ${t.text} tracking-tight mb-2`}>
                    Resto del ranking
                  </h3>
                  <p className={`text-sm ${t.text2}`}>{rest.length} jugador{rest.length !== 1 ? 'es' : ''} más competido</p>
                </div>

                <div className="space-y-3">
                  {rest.map((player) => {
                    const isCurrentUser = player.nickname === user?.nickname
                    return (
                      <div
                        key={player.userId}
                        className={`rounded-xl ${t.bg2} ${t.border} border p-5 transition-all hover:shadow-md relative`}
                        style={isCurrentUser ? { borderLeft: `4px solid ${accentColor}` } : {}}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg ${t.bg3} flex items-center justify-center font-mono font-bold text-sm ${t.text}`}>
                              {player.rank}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className={`font-bold ${t.text} text-base`}>{player.nickname}</h4>
                                {isCurrentUser && (
                                  <span className="text-[10px] bg-opacity-20 px-2 py-0.5 rounded font-bold uppercase tracking-wider" style={{ backgroundColor: `${accentColor}30`, color: accentColor }}>
                                    Tú
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-6 sm:text-right font-mono text-sm border-t sm:border-t-0 border-opacity-10 pt-3 sm:pt-0" style={{ borderColor: dark ? '#2A2A3A' : '#D9D2C8' }}>
                            <div>
                              <p className={`text-[10px] uppercase tracking-widest ${t.text3} font-sans font-semibold mb-0.5`}>Score</p>
                              <p className="font-bold" style={{ color: accentColor }}>{Math.round(player.bestScore)}</p>
                            </div>
                            <div>
                              <p className={`text-[10px] uppercase tracking-widest ${t.text3} font-sans font-semibold mb-0.5`}>Tiempo</p>
                              <p className={`font-semibold ${t.text}`}>{player.bestTime.toFixed(1)}s</p>
                            </div>
                            <div>
                              <p className={`text-[10px] uppercase tracking-widest ${t.text3} font-sans font-semibold mb-0.5`}>Puzzles</p>
                              <p className={t.text3}>{player.solved}<span className="text-xs opacity-50">/{player.totalPuzzles}</span></p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : selectedBlockId && selectedBlock && ranking.length === 0 ? (
          <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border animate-slide-up`}>
            <p className={`text-lg ${t.text2}`}>No hay datos de intentos para este bloque aún</p>
            <p className={`text-sm ${t.text3} mt-2`}>Completa algunos cycles para ver el ranking</p>
          </div>
        ) : null}
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