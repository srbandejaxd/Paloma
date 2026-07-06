import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fetchBlocks, fetchAttempts } from '../lib/api'
import { Block, AttemptRecord } from '../types'

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
]

export default function History() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [dark, setDark] = useState(true)
  const [loading, setLoading] = useState(true)
  const [allAttempts, setAllAttempts] = useState<AttemptRecord[]>([])
  const [expandedAttemptId, setExpandedAttemptId] = useState<number | null>(null)

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
      setAttempts([])
      return
    }
    
    setLoading(true)
    fetchAttempts(selectedBlockId)
      .then((data: AttemptRecord[]) => {
        setAttempts(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
        setAllAttempts(data)
        setLoading(false)
      })
      .catch((err: Error) => {
        console.error('Error loading attempts:', err)
        setLoading(false)
      })
  }, [selectedBlockId])

  // Cargar TODOS los intentos del usuario para calcular racha de días
  useEffect(() => {
    if (!blocks.length) return
    const loadAllAttempts = async () => {
      try {
        const allData: AttemptRecord[] = []
        for (const block of blocks) {
          const blockData = await fetchAttempts(block.id)
          allData.push(...blockData)
        }
        setAllAttempts(allData)
      } catch (err) {
        console.error('Error loading all attempts:', err)
      }
    }
    loadAllAttempts()
  }, [blocks])

  // Calcular racha de días (días consecutivos que entró a la página)
  const calculateDayStreak = () => {
    const uniqueDays = new Set(allAttempts.map(a => {
      const date = new Date(a.createdAt)
      return date.toISOString().split('T')[0]
    }))
    
    const sortedDays = Array.from(uniqueDays).sort().reverse()
    
    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    for (let i = 0; i < sortedDays.length; i++) {
      const checkDate = new Date(sortedDays[i])
      checkDate.setHours(0, 0, 0, 0)
      
      const expectedDate = new Date(today)
      expectedDate.setDate(expectedDate.getDate() - i)
      
      if (checkDate.getTime() === expectedDate.getTime()) {
        streak++
      } else {
        break
      }
    }
    
    return streak
  }

  // Obtener actividad del mes actual (para el calendario)
  const getMonthActivity = () => {
    const daysWithAttempts = new Set(allAttempts.map(a => {
      const date = new Date(a.createdAt)
      return date.getDate()
    }))
    return daysWithAttempts
  }

  // Generar días del calendario
  const generateCalendarDays = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    const days = []
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(i)
    }
    
    return days
  }

  // Estadísticas generales
  const stats = {
    totalAttempts: attempts.length,
    dayStreak: calculateDayStreak(),
    bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : 0,
    avgAccuracy: attempts.length > 0 ? (attempts.reduce((sum, a) => sum + a.accuracy, 0) / attempts.length) : 0,
    bestTime: attempts.length > 0 ? Math.min(...attempts.map(a => a.totalTimeMs)) / 1000 : 0,
  }

  const monthActivity = getMonthActivity()
  const calendarDays = generateCalendarDays()

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
    { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
    { path: '/blind', label: 'Ciego', icon: '🎲' },
  ]

  const selectedBlock = blocks.find(b => b.id === selectedBlockId)

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
        <p className={t.text3}>Cargando historial...</p>
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
          <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Tu progreso</p>
          <h2 className={`text-5xl font-bold ${t.text} mb-4 leading-none`} style={{ letterSpacing: '-0.02em' }}>
            Historial de entrenamientos
          </h2>
          <p className={`text-lg max-w-2xl ${t.text2} leading-relaxed`}>
            Selecciona una categoría, subcategoría y bloque para ver tu historial completo de intentos.
          </p>
        </div>

        {/* Racha y Calendario */}
        <div className={`grid md:grid-cols-2 gap-6 mb-16 animate-slide-up`}>
          {/* Racha de días */}
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 text-center`}>
            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Tu racha actual</p>
            <div className="flex items-end justify-center gap-3">
              <div>
                <p className={`text-7xl font-bold`} style={{ color: accentColor }}>
                  {stats.dayStreak}
                </p>
                <p className={`text-sm ${t.text3} mt-2`}>días consecutivos</p>
              </div>
              <div className="text-5xl mb-2">🔥</div>
            </div>
          </div>

          {/* Mini Calendario */}
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8`}>
            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Actividad de {new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</p>
            <div className="grid grid-cols-7 gap-2">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => (
                <div key={day} className="text-center">
                  <p className={`text-xs font-semibold ${t.text3}`}>{day}</p>
                </div>
              ))}
              {calendarDays.map(day => {
                const hasActivity = monthActivity.has(day)
                return (
                  <div key={day} className="flex justify-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all`}
                      style={{
                        backgroundColor: hasActivity ? '#27ae60' : dark ? '#1F1F2E' : '#E5DFD5',
                        color: hasActivity ? 'white' : 'currentColor',
                      }}
                      title={hasActivity ? `${day} - Entrenaste` : `${day} - Sin entrenamiento`}
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

        {/* Historial - Solo aparece si hay bloque seleccionado */}
        {selectedBlockId && selectedBlock && attempts.length > 0 ? (
          <div className="animate-slide-up">
            {/* Estadísticas principales */}
            <div className="mb-16">
              <div className="grid md:grid-cols-4 gap-4 mb-8">
                {/* Mejor Score */}
                <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 transition-all hover:shadow-lg`}>
                  <div className="mb-4">
                    <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>⭐ Mejor score</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-5xl font-bold`} style={{ color: accentColor }}>
                      {Math.round(stats.bestScore)}
                    </p>
                    <p className={`text-xs ${t.text3} mt-2`}>en {attempts.length} intentos</p>
                  </div>
                </div>

                {/* Precisión promedio */}
                <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 transition-all hover:shadow-lg`}>
                  <div className="mb-4">
                    <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>🎯 Precisión</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-5xl font-bold`} style={{ color: accentColor }}>
                      {stats.avgAccuracy.toFixed(0)}%
                    </p>
                    <p className={`text-xs ${t.text3} mt-2`}>promedio</p>
                  </div>
                </div>

                {/* Mejor tiempo */}
                <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 transition-all hover:shadow-lg`}>
                  <div className="mb-4">
                    <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>⚡ Mejor tiempo</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-4xl font-bold ${t.text}`}>
                      {stats.bestTime.toFixed(1)}s
                    </p>
                    <p className={`text-xs ${t.text3} mt-2`}>en un intento</p>
                  </div>
                </div>

                {/* Total de intentos */}
                <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 transition-all hover:shadow-lg`}>
                  <div className="mb-4">
                    <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>📊 Total</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-5xl font-bold ${t.text}`}>
                      {stats.totalAttempts}
                    </p>
                    <p className={`text-xs ${t.text3} mt-2`}>entrenamientos</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Lista de intentos */}
            <div>
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
                  const N = selectedBlock.puzzleCount
                  const score = 1000 * N - (attempt.totalTimeMs / 1000)

                  return (
                    <div
                      key={attempt.id}
                      className={`rounded-xl ${t.bg2} ${t.border} border p-5 transition-all hover:shadow-lg`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Fecha y número */}
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-lg ${t.bg3} flex-shrink-0`}>
                            <p className={`text-xs uppercase tracking-widest ${t.text3}`}>{dateStr}</p>
                            <p className={`text-sm font-bold ${t.text}`}>{timeStr}</p>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-bold ${t.text}`}>Intento #{stats.totalAttempts - idx}</h4>
                            <p className={`text-xs ${t.text3}`}>{(attempt.totalTimeMs / 1000).toFixed(1)}s • {attempt.solved}/{attempt.totalPuzzles} correctos</p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden sm:grid grid-cols-4 gap-6">
                          <div className="text-right">
                            <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Score</p>
                            <p className={`text-lg font-bold`} style={{ color: accentColor }}>{Math.round(score)}</p>
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

                        {/* Arrow mobile */}
                        <div className="sm:hidden">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </div>
                      </div>

                      {/* Barra de progreso */}
                      <div className="mt-4 pt-4 border-t border-opacity-20" style={{ borderColor: dark ? '#2A2A3A' : '#D9D2C8' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs uppercase tracking-widest ${t.text3}`}>Progreso</span>
                          <span className={`text-sm font-semibold ${t.text}`}>{attempt.solved}/{attempt.totalPuzzles}</span>
                        </div>
                        <div className={`h-2 ${t.track} rounded-full overflow-hidden`}>
                          <div 
                            className="h-full transition-all rounded-full" 
                            style={{ 
                              width: `${(attempt.solved / attempt.totalPuzzles) * 100}%`, 
                              backgroundColor: accentColor 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : selectedBlockId && selectedBlock && attempts.length === 0 ? (
          <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border animate-slide-up`}>
            <p className={`text-lg ${t.text2}`}>No hay intentos registrados para este bloque</p>
            <p className={`text-sm ${t.text3} mt-2`}>Comienza un entrenamiento en Solo para ver tu historial aquí</p>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className={`${t.bg2} ${t.border} border-t backdrop-blur-xl`}>
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
