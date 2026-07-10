import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fetchBlocks, fetchAttempts, fetchVisionHistory, VisionSession } from '../lib/api'
import { Block, AttemptRecord } from '../types'

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

const CATEGORIES = [
  { id: "checkmate_patterns", label: "Checkmate Patterns Manual" },
  { id: "palomita", label: "Woodpecker Method" },
  { id: "woodpecker_method2", label: "Woodpecker Method 2" },
  { id: "patterns_must_know", label: "Los 100 patrones que debes saber" },
]

const NAV_ITEMS = [
  { path: '/solo', label: 'Home', icon: '🏠' },
  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
  { path: '/vision', label: 'Visión', icon: '👁' },
  { path: '/history', label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
  { path: '/blind', label: 'Ciego', icon: '🎲' },
]

// Clave para localStorage
const STREAK_CACHE_KEY = 'wp_streak_cache'

interface StreakCache {
  activeDays: string[]   // ISO date strings YYYY-MM-DD
  lastUpdated: string    // ISO date string
}

export default function History() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(true)
  const [streakLoading, setStreakLoading] = useState(true)
  const [expandedAttemptId, setExpandedAttemptId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('puzzles')
  const [visionSessions, setVisionSessions] = useState<VisionSession[]>([])
  const [visionLoading, setVisionLoading] = useState(false)

  // Estado de racha y actividad — cargado desde cache o API
  const [activeDays, setActiveDays] = useState<Set<string>>(new Set())

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
      
      // Si viene blockId en query params, cargar automáticamente
      const blockIdParam = searchParams.get('blockId')
      if (blockIdParam) {
        const bid = parseInt(blockIdParam)
        const block = b.find(x => x.id === bid)
        if (block) {
          setSelectedCategory(block.category)
          setSelectedSubcategory(block.subcategory || null)
          setSelectedBlockId(bid)
          // Cargar automáticamente los attempts de ese bloque
          fetchAttempts(bid).then(a => {
            setAttempts(a)
          }).catch(console.error)
        }
      }
      
      setLoading(false)
    }).catch(console.error)
  }, [user, navigate, searchParams])

  // Cargar actividad — primero desde cache, luego refrescar en background
  useEffect(() => {
    if (!blocks.length) return

    // 1. Cargar cache inmediatamente
    const cached = localStorage.getItem(STREAK_CACHE_KEY)
    if (cached) {
      try {
        const parsed: StreakCache = JSON.parse(cached)
        setActiveDays(new Set(parsed.activeDays))
        setStreakLoading(false)
      } catch (_) {}
    }

    // 2. Refrescar en background (sin bloquear UI)
    const refresh = async () => {
      try {
        const allDays = new Set<string>()
        for (const block of blocks) {
          const data: AttemptRecord[] = await fetchAttempts(block.id)
          for (const a of data) {
            const d = new Date(a.createdAt)
            // Usar fecha local, no UTC
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            allDays.add(key)
          }
        }
        setActiveDays(allDays)
        setStreakLoading(false)
        const cache: StreakCache = {
          activeDays: Array.from(allDays),
          lastUpdated: new Date().toISOString(),
        }
        localStorage.setItem(STREAK_CACHE_KEY, JSON.stringify(cache))
      } catch (err) {
        console.error('Error refreshing streak data:', err)
        setStreakLoading(false)
      }
    }

    refresh()
  }, [blocks])

  // Calcular racha de días consecutivos (días con al menos un cycle)
  const calculateDayStreak = useCallback(() => {
    const today = new Date()
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (activeDays.has(key)) {
        streak++
      } else {
        break
      }
    }
    return streak
  }, [activeDays])

  // Obtener días activos del mes actual
  const getMonthActivity = useCallback(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const active = new Set<number>()
    for (const day of activeDays) {
      const [y, m, d] = day.split('-').map(Number)
      if (y === year && m === month) active.add(d)
    }
    return active
  }, [activeDays])

  // Calendario: genera celdas con offset correcto para el día de la semana
  // Semana empieza en Lunes (L=0, M=1, X=2, J=3, V=4, S=5, D=6)
  const generateCalendar = useCallback(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    const firstDay = new Date(year, month, 1)
    // getDay(): 0=Domingo,1=Lunes,...,6=Sábado → convertir a Lun=0
    const startOffset = (firstDay.getDay() + 6) % 7
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    return { startOffset, daysInMonth, todayDate: today.getDate() }
  }, [])

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
    if (tab !== 'vision') return
    if (visionSessions.length > 0) return
    setVisionLoading(true)
    fetchVisionHistory('coordinates')
      .then((data: VisionSession[]) => {
        setVisionSessions(data)
        setVisionLoading(false)
      })
      .catch(() => setVisionLoading(false))
  }, [tab])

  useEffect(() => {
    if (!selectedBlockId) { setAttempts([]); return }
    setLoading(true)
    fetchAttempts(selectedBlockId)
      .then((data: AttemptRecord[]) => {
        setAttempts(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
        setLoading(false)
      })
      .catch((err: Error) => { console.error(err); setLoading(false) })
  }, [selectedBlockId])

  const dayStreak = calculateDayStreak()
  const monthActivity = getMonthActivity()
  const { startOffset, daysInMonth, todayDate } = generateCalendar()

  const selectedBlock = blocks.find(b => b.id === selectedBlockId)

  const stats = {
    totalAttempts: attempts.length,
    bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : 0,
    avgAccuracy: attempts.length > 0 ? (attempts.reduce((sum, a) => sum + a.accuracy, 0) / attempts.length) : 0,
    bestTime: attempts.length > 0 ? Math.min(...attempts.map(a => a.totalTimeMs)) / 1000 : 0,
  }

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
            >
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
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                      style={{ backgroundColor: accentColor }}
                    />
                  </button>
                  {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
                </div>
              )
            })}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Tu progreso</p>
          <h2 className={`text-5xl font-bold ${t.text} mb-8 leading-none`} style={{ letterSpacing: '-0.02em' }}>
            Historial de entrenamientos
          </h2>
          {/* Tabs */}
          <div className={`inline-flex rounded-xl ${t.bg2} ${t.border} border p-1 gap-1`}>
            <button
              onClick={() => setTab('puzzles')}
              className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={tab === 'puzzles' ? { backgroundColor: accentColor, color: 'white' } : {}}
            >
              <span className={tab === 'puzzles' ? 'text-white' : t.text2}>🪃 Puzzles</span>
            </button>
            <button
              onClick={() => setTab('vision')}
              className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={tab === 'vision' ? { backgroundColor: accentColor, color: 'white' } : {}}
            >
              <span className={tab === 'vision' ? 'text-white' : t.text2}>👁 Visión</span>
            </button>
          </div>
        </div>

        {/* ── TAB VISIÓN ────────────────────────────────────────────────── */}
        {tab === 'vision' && (
          <div>
            {visionLoading ? (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
                <p className={`text-lg ${t.text2}`}>Cargando sesiones...</p>
              </div>
            ) : visionSessions.length > 0 ? (
              <div>
                {/* Stats rápidas */}
                <div className="grid md:grid-cols-3 gap-4 mb-12">
                  <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 text-center`}>
                    <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>🏆 Mejor score</p>
                    <p className="text-5xl font-bold" style={{ color: accentColor }}>{Math.max(...visionSessions.map(s => s.score))}</p>
                    <p className={`text-xs ${t.text3} mt-2`}>casillas correctas</p>
                  </div>
                  <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 text-center`}>
                    <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>📊 Sesiones</p>
                    <p className={`text-5xl font-bold ${t.text}`}>{visionSessions.length}</p>
                    <p className={`text-xs ${t.text3} mt-2`}>partidas jugadas</p>
                  </div>
                  <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 text-center`}>
                    <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>🎯 Promedio</p>
                    <p className={`text-5xl font-bold ${t.text}`}>
                      {(visionSessions.reduce((s, v) => s + v.score, 0) / visionSessions.length).toFixed(1)}
                    </p>
                    <p className={`text-xs ${t.text3} mt-2`}>puntos por sesión</p>
                  </div>
                </div>

                {/* Lista de sesiones */}
                <div className="mb-6">
                  <h3 className={`text-2xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>Últimas sesiones</h3>
                </div>
                <div className="space-y-3">
                  {visionSessions.map((session, idx) => {
                    const date = new Date(session.createdAt)
                    const dateStr = date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })
                    const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={idx} className={`rounded-xl ${t.bg2} ${t.border} border p-5 flex items-center justify-between gap-4`}>
                        <div className="flex items-center gap-4">
                          <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg ${t.bg3} flex-shrink-0`}>
                            <p className={`text-xs uppercase tracking-widest ${t.text3}`}>{dateStr}</p>
                            <p className={`text-sm font-bold ${t.text}`}>{timeStr}</p>
                          </div>
                          <div>
                            <p className={`font-bold ${t.text}`}>Coordenadas · 30s</p>
                            <p className={`text-xs ${t.text3}`}>{session.errors} errores</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="text-right">
                            <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Score</p>
                            <p className="text-2xl font-bold" style={{ color: accentColor }}>{session.score}</p>
                          </div>
                          <div className="text-right hidden sm:block">
                            <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Errores</p>
                            <p className={`text-2xl font-bold ${t.text}`}>{session.errors}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
                <p className={`text-lg ${t.text2}`}>No has jugado sesiones de Visión aún</p>
                <p className={`text-sm ${t.text3} mt-2`}>Ve al modo Visión y completa una partida para ver tu historial aquí</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB PUZZLES ───────────────────────────────────────────────── */}
        {tab === 'puzzles' && <>

        {/* Racha + Calendario */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">

          {/* Racha */}
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8`}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-1`}>Racha actual</p>
                <p className={`text-xs ${t.text3}`}>Días consecutivos haciendo al menos un cycle</p>
              </div>
              <span className="text-3xl">🔥</span>
            </div>
            <div className="flex items-end gap-3">
              {streakLoading ? (
                <p className={`text-5xl font-bold ${t.text3}`}>–</p>
              ) : (
                <p className="text-7xl font-bold leading-none" style={{ color: accentColor }}>{dayStreak}</p>
              )}
              <p className={`text-lg ${t.text2} mb-2`}>días</p>
            </div>
            {streakLoading && (
              <p className={`text-xs ${t.text3} mt-3`}>Calculando racha...</p>
            )}
            {!streakLoading && dayStreak === 0 && (
              <p className={`text-xs ${t.text3} mt-3`}>Completa un cycle hoy para empezar tu racha 💪</p>
            )}
          </div>

          {/* Calendario */}
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-1`}>
                  {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </p>
                <p className={`text-xs ${t.text3}`}>Días que entrenaste este mes</p>
              </div>
              {streakLoading && <p className={`text-xs ${t.text3}`}>Cargando...</p>}
            </div>

            {/* Cabecera días */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                <div key={d} className="text-center">
                  <p className={`text-xs font-semibold ${t.text3}`}>{d}</p>
                </div>
              ))}
            </div>

            {/* Celdas del calendario */}
            <div className="grid grid-cols-7 gap-1">
              {/* Celdas vacías para el offset */}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {/* Días del mes */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const hasActivity = monthActivity.has(day)
                const isToday = day === todayDate
                return (
                  <div key={day} className="flex justify-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: hasActivity
                          ? '#27ae60'
                          : isToday
                            ? (dark ? '#2A2A3A' : '#D9D2C8')
                            : (dark ? '#1F1F2E' : '#E5DFD5'),
                        color: hasActivity ? 'white' : isToday ? accentColor : (dark ? '#7A776E' : '#8A8478'),
                        fontWeight: isToday ? 700 : undefined,
                        outline: isToday && !hasActivity ? `2px solid ${accentColor}` : undefined,
                      }}
                    >
                      {day}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

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

        {/* Lista de intentos */}
        {selectedBlockId && selectedBlock && attempts.length > 0 ? (
          <div>
            {/* Stats del bloque */}
            <div className="grid md:grid-cols-4 gap-4 mb-12">
              {[
                { label: '⭐ Mejor score', value: Math.round(stats.bestScore), sub: `en ${attempts.length} intentos`, accent: true },
                { label: '🎯 Precisión', value: `${stats.avgAccuracy.toFixed(0)}%`, sub: 'promedio', accent: true },
                { label: '⚡ Mejor tiempo', value: `${stats.bestTime.toFixed(1)}s`, sub: 'en un intento', accent: false },
                { label: '📊 Total', value: stats.totalAttempts, sub: 'entrenamientos', accent: false },
              ].map(card => (
                <div key={card.label} className={`rounded-xl ${t.bg2} ${t.border} border p-6 text-center`}>
                  <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>{card.label}</p>
                  <p className={`text-4xl font-bold`} style={{ color: card.accent ? accentColor : undefined }}>
                    <span className={card.accent ? '' : t.text}>{card.value}</span>
                  </p>
                  <p className={`text-xs ${t.text3} mt-2`}>{card.sub}</p>
                </div>
              ))}
            </div>

            <div className="mb-8">
              <h3 className={`text-2xl font-bold ${t.text} leading-none mb-2`} style={{ letterSpacing: '-0.02em' }}>
                Últimos entrenamientos
              </h3>
              <p className={`text-sm ${t.text2}`}>{attempts.length} intentos registrados</p>
            </div>

            <div className="space-y-3">
              {attempts.map((attempt, idx) => {
                const date = new Date(attempt.createdAt)
                const dateStr = date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })
                const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                const score = 1000 * attempt.solved - (attempt.totalTimeMs / 1000)
                const isExpanded = expandedAttemptId === attempt.id
                const hasFailed = attempt.failedPuzzles && attempt.failedPuzzles.length > 0

                return (
                  <div
                    key={attempt.id}
                    className={`rounded-xl ${t.bg2} ${t.border} border overflow-hidden transition-all`}
                  >
                    {/* Fila principal — clickeable */}
                    <button
                      className="w-full p-5 text-left"
                      onClick={() => setExpandedAttemptId(isExpanded ? null : attempt.id)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg ${t.bg3} flex-shrink-0`}>
                            <p className={`text-xs uppercase tracking-widest ${t.text3}`}>{dateStr}</p>
                            <p className={`text-sm font-bold ${t.text}`}>{timeStr}</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className={`font-bold ${t.text}`}>Intento #{stats.totalAttempts - idx}</h4>
                              {hasFailed && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 bg-opacity-20 text-red-400 font-semibold">
                                  {attempt.failedPuzzles.length} error{attempt.failedPuzzles.length !== 1 ? 'es' : ''}
                                </span>
                              )}
                              {!hasFailed && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500 bg-opacity-20 text-green-400 font-semibold">
                                  Perfecto
                                </span>
                              )}
                            </div>
                            <p className={`text-xs ${t.text3}`}>{(attempt.totalTimeMs / 1000).toFixed(1)}s • {attempt.solved}/{attempt.totalPuzzles} resueltos</p>
                          </div>
                        </div>

                        <div className="hidden sm:grid grid-cols-4 gap-6">
                          <div className="text-right">
                            <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Score</p>
                            <p className="text-lg font-bold" style={{ color: accentColor }}>{Math.round(score)}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Precisión</p>
                            <p className={`text-lg font-bold ${t.text}`}>{attempt.accuracy.toFixed(0)}%</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Errores</p>
                            <p className={`text-lg font-bold ${t.text}`}>{attempt.errors}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Tiempo</p>
                            <p className={`text-lg font-bold ${t.text}`}>{(attempt.totalTimeMs / 1000).toFixed(1)}s</p>
                          </div>
                        </div>

                        {/* Chevron */}
                        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </div>
                      </div>

                      {/* Barra de progreso */}
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: dark ? '#2A2A3A' : '#D9D2C8' }}>
                        <div className={`h-1.5 ${t.track} rounded-full overflow-hidden`}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(attempt.solved / attempt.totalPuzzles) * 100}%`, backgroundColor: accentColor }}
                          />
                        </div>
                      </div>
                    </button>

                    {/* Panel expandido — puzzles fallados */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t" style={{ borderColor: dark ? '#2A2A3A' : '#D9D2C8' }}>
                        <div className="pt-4">
                          {hasFailed ? (
                            <>
                              <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                                Puzzles fallados en este cycle
                              </p>
                              <div className="space-y-2">
                                {attempt.failedPuzzles.map((fp) => (
                                  <button
                                    key={fp.puzzleId}
                                    onClick={() => navigate(`/puzzles?blockId=${attempt.blockId}&puzzleId=${fp.puzzleId}`)}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg ${t.bg3} ${t.border} border transition-all hover:shadow-md group`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                                        style={{ backgroundColor: '#E74C3C' }}
                                      >
                                        {fp.orderInBlock}
                                      </div>
                                      <div className="text-left">
                                        <p className={`text-sm font-semibold ${t.text}`}>Puzzle #{fp.puzzleId}</p>
                                        <p className={`text-xs ${t.text3}`}>Posición {fp.orderInBlock} en el bloque</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs px-2 py-1 rounded-md bg-red-500 bg-opacity-20 text-red-400 font-semibold">
                                        {fp.errors} error{fp.errors !== 1 ? 'es' : ''}
                                      </span>
                                      <svg
                                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                        className={`${t.text3} group-hover:${t.text} transition-colors`}
                                      >
                                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                                      </svg>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-4">
                              <p className="text-2xl mb-2">🎯</p>
                              <p className={`text-sm font-semibold ${t.text}`}>Cycle perfecto</p>
                              <p className={`text-xs ${t.text3} mt-1`}>No fallaste ningún puzzle en este intento</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : selectedBlockId && selectedBlock && attempts.length === 0 && !loading ? (
          <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
            <p className={`text-lg ${t.text2}`}>No hay intentos registrados para este bloque</p>
            <p className={`text-sm ${t.text3} mt-2`}>Comienza un entrenamiento en Solo para ver tu historial aquí</p>
          </div>
        ) : null}
        </>}
      </div>

      {/* Footer */}
      <div className={`${t.bg2} ${t.border} border-t backdrop-blur-xl mt-16`}>
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className={`text-sm ${t.text3}`}>Todos tus entrenamientos están aquí</p>
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
