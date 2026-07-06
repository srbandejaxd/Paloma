import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBlocks, fetchPuzzlesForBlock, saveAttempt } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Block, Puzzle } from '../types'
import { useTimer } from '../hooks/useTimer'
import { formatTimerDisplay, formatTimeLong } from '../lib/time'
import PuzzleBoard from '../components/Board/PuzzleBoard'

type Phase = 'category' | 'select' | 'racing' | 'done'

const CATEGORIES = [
  { id: "checkmate_patterns", label: "Checkmate Patterns Manual", description: "Domina los 34 patrones de mate esenciales", icon: '♚' },
  { id: "palomita", label: "Woodpecker Method", description: "Puzzles de todas las dificultades", icon: '🪃' },
  { id: "woodpecker_method2", label: "Woodpecker Method 2", description: "Puzzles posicionales avanzados", icon: '♞' },
]

const NAV_ITEMS = [
  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
  { path: '/vision', label: 'Visión', icon: '👁' },
  { path: '/history', label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
  { path: '/blind', label: 'Ciego', icon: '🎲' },
]

interface FailedPuzzle {
  puzzleId: number
  idx: number
  orderInBlock: number
  errors: number
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

export default function Solo() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('category')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [puzzles, setPuzzles] = useState<Puzzle[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [solved, setSolved] = useState(0)
  const [totalErrors, setTotalErrors] = useState(0)
  const [puzzleErrors, setPuzzleErrors] = useState(0)
  const [finalTime, setFinalTime] = useState(0)
  const [failedPuzzles, setFailedPuzzles] = useState<FailedPuzzle[]>([])
  const [dark, setDark] = useState(true)

  const puzzleTimesRef = useRef<{ puzzleId: number; orderInBlock: number; timeMs: number; errors: number }[]>([])
  const puzzleStartRef = useRef<number>(Date.now())
  const solvedRef = useRef(0)
  const totalErrorsRef = useRef(0)

  const { elapsed, reset: resetTimer } = useTimer(phase === 'racing')

  useEffect(() => { solvedRef.current = solved }, [solved])
  useEffect(() => { totalErrorsRef.current = totalErrors }, [totalErrors])

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
    fetchBlocks().then(setBlocks).catch(console.error)
  }, [user, navigate])

  const blocksForCategory = blocks.filter(b => b.category === selectedCategory)
  const subcategoriesForCategory = [...new Set(blocksForCategory.map(b => b.subcategory).filter(Boolean))] as string[]
  const hasSubcategories = subcategoriesForCategory.length > 0
  const blocksToShow = hasSubcategories
    ? blocksForCategory.filter(b => b.subcategory === selectedSubcategory)
    : blocksForCategory.filter(b => !b.subcategory)

  async function startSolo(block: Block) {
    setSelectedBlock(block)
    const fetched = await fetchPuzzlesForBlock(block.id)
    setPuzzles(fetched)
    setCurrentIdx(0)
    setSolved(0)
    setTotalErrors(0)
    setFailedPuzzles([])
    puzzleTimesRef.current = []
    puzzleStartRef.current = Date.now()
    solvedRef.current = 0
    totalErrorsRef.current = 0
    resetTimer()
    setPhase('racing')
  }

  const advancePuzzle = useCallback(async (timeMs: number, errors: number, skipped: boolean, idxOverride?: number) => {
    if (!selectedBlock) return
    const idx = idxOverride ?? currentIdx
    const puzzle = puzzles[idx]
    if (!puzzle) return

    puzzleTimesRef.current.push({ puzzleId: puzzle.id, orderInBlock: puzzle.orderInBlock, timeMs, errors })

    const newSolved = skipped ? solvedRef.current : solvedRef.current + 1
    const newErrors = totalErrorsRef.current + errors
    setSolved(newSolved)
    setTotalErrors(newErrors)
    setPuzzleErrors(0)

    const nextIdx = idx + 1
    if (nextIdx >= puzzles.length) {
      const total = elapsed
      setFinalTime(total)
      setPhase('done')
      try {
        await saveAttempt({
          blockId: selectedBlock.id,
          totalTimeMs: total,
          solved: newSolved,
          totalPuzzles: puzzles.length,
          errors: newErrors,
          puzzleTimes: puzzleTimesRef.current,
        })
      } catch (e) { console.error('Failed to save attempt', e) }
    } else {
      setCurrentIdx(nextIdx)
      puzzleStartRef.current = Date.now()
    }
  }, [currentIdx, puzzles, elapsed, selectedBlock])

  const handleSolved = useCallback((timeMs: number, errors: number) => advancePuzzle(timeMs, errors, false), [advancePuzzle])

  const handleSkip = useCallback((errors: number) => {
    const timeMs = Date.now() - puzzleStartRef.current
    const puzzle = puzzles[currentIdx]
    setFailedPuzzles(prev => [...prev, {
      puzzleId: puzzle?.id ?? 0,
      idx: currentIdx,
      orderInBlock: puzzle?.orderInBlock ?? currentIdx + 1,
      errors,
    }])
    advancePuzzle(timeMs, errors, true, currentIdx)
  }, [currentIdx, puzzles, advancePuzzle])

  const handleError = useCallback(() => setPuzzleErrors(prev => prev + 1), [])

  // THEME TOKENS
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

  // NAVBAR
  function ProfessionalNav() {
    return (
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
            {/* Solo Button - Siempre visible */}
            <div className="flex items-center">
              <button
                onClick={() => {
                  setPhase('category')
                  setSelectedCategory(null)
                  setSelectedSubcategory(null)
                  setSelectedBlock(null)
                }}
                className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all ${t.text2} hover:${t.text} relative group`}
              >
                <span className="text-lg">🪃</span>
                <span className="whitespace-nowrap">Solo</span>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all scale-x-0 group-hover:scale-x-100`} style={{ backgroundColor: accentColor }} />
              </button>
              <div className={`w-px h-4 ${t.borderLight}`} />
            </div>

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
    )
  }

  // CATEGORY SCREEN
  if (phase === 'category') {
    return (
      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
        <ProfessionalNav />
        
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="mb-16 animate-slide-up">
            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Elige tu entrenamiento</p>
            <h2 className={`text-5xl font-bold ${t.text} mb-4 leading-none`} style={{ letterSpacing: '-0.02em' }}>
              ¿Qué categoría te llamará hoy?
            </h2>
            <p className={`text-lg max-w-2xl ${t.text2} mt-4 leading-relaxed`}>
              Selecciona una categoría y elige el bloque de puzzles en el que deseas entrenar. Cada sesión es un cycle, y tu progreso se mantiene guardado.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-20">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                    setSelectedCategory(cat.id)
                    setPhase('select')
                }}
                className={`group relative overflow-hidden rounded-xl ${t.bg2} ${t.border} border transition-all duration-300 hover:border-opacity-100 hover:shadow-lg hover:-translate-y-1`}
              >
                <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300`} style={{ background: `linear-gradient(135deg, ${accentColor}20, transparent)` }} />
                
                <div className="relative p-8">
                  <div className="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-300">{cat.icon}</div>
                  
                  <h3 className={`text-xl font-bold ${t.text} mb-3 text-left leading-tight`}>{cat.label}</h3>
                  
                  <p className={`text-sm ${t.text2} text-left mb-6 leading-relaxed`}>{cat.description}</p>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1">
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
                      Seleccionar
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: accentColor }}>
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`fixed bottom-0 left-0 right-0 ${t.bg2} ${t.border} border-t backdrop-blur-xl`}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-end">
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

  // SELECT SCREEN (Subcategoría + Bloque)
  if (phase === 'select' && selectedCategory) {
    const catLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label
    
    return (
      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
        <ProfessionalNav />
        
        <div className="max-w-7xl mx-auto px-6 py-16">
          <button
            onClick={() => {
              setSelectedCategory(null)
              setSelectedSubcategory(null)
            }}
            className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-12`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Volver atrás
          </button>

          <div className="mb-16 animate-slide-up">
            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>{catLabel}</p>
            <h2 className={`text-5xl font-bold ${t.text} leading-none mb-4`} style={{ letterSpacing: '-0.02em' }}>
              Elige un bloque
            </h2>
            <p className={`text-lg ${t.text2} mt-4 max-w-2xl leading-relaxed`}>
              Cada bloque contiene un conjunto de puzzles. Completa el bloque y ese será un cycle.
            </p>
          </div>

          {/* Selectors */}
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-16 animate-slide-up`}>
            <div className={`grid ${hasSubcategories ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-6 mb-8`}>
              {hasSubcategories && (
                <div>
                  <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                    Subcategoría
                  </label>
                  <select
                    value={selectedSubcategory || ''}
                    onChange={(e) => setSelectedSubcategory(e.target.value || null)}
                    className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold`}
                  >
                    <option value="">Elige una subcategoría...</option>
                    {subcategoriesForCategory.map(sub => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                  Bloque
                </label>
                <select
                  value={selectedBlock?.id || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const block = blocks.find(b => b.id === Number(e.target.value))
                      setSelectedBlock(block || null)
                    }
                  }}
                  disabled={blocksToShow.length === 0}
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

            {selectedBlock && (
              <button
                onClick={() => startSolo(selectedBlock)}
                className={`w-full py-4 ${t.accentBg} text-white font-bold text-sm tracking-widest uppercase rounded-xl transition-all hover:opacity-90 hover:shadow-lg transform hover:scale-105`}
              >
                Empezar Cycle
              </button>
            )}
          </div>
        </div>

        <div className={`fixed bottom-0 left-0 right-0 ${t.bg2} ${t.border} border-t backdrop-blur-xl`}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-end">
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

  // DONE SCREEN
  if (phase === 'done') {
    const accuracy = ((solved / puzzles.length) * 100).toFixed(0)
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center px-6 py-16 transition-colors duration-300`}>
        <div className="w-full max-w-2xl text-center animate-slide-up">
          <div className="mb-12">
            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-4`}>Cycle completado</p>
            <div className={`rounded-2xl ${t.bg2} ${t.border} border p-10 mb-8`}>
              <div className="text-7xl font-bold leading-none mb-4" style={{ color: accentColor, letterSpacing: '-0.02em' }}>
                {formatTimeLong(finalTime)}
              </div>
              <div className="flex items-center justify-center gap-8 mt-8">
                <div>
                  <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Precisión</p>
                  <p className={`text-3xl font-bold ${t.text}`}>{accuracy}%</p>
                  <p className={`text-xs ${t.text3} mt-1`}>{solved}/{puzzles.length} resueltos</p>
                </div>
                <div className={`w-px h-16 ${t.borderLight}`} />
                <div>
                  <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Errores</p>
                  <p className="text-3xl font-bold" style={{ color: totalErrors > 5 ? '#E74C3C' : accentColor }}>{totalErrors}</p>
                  <p className={`text-xs ${t.text3} mt-1`}>en todo el bloque</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => startSolo(selectedBlock!)}
              className={`w-full py-4 ${t.accentBg} text-white font-bold text-sm tracking-widest uppercase rounded-xl transition-all hover:opacity-90 hover:shadow-lg transform hover:scale-105`}
            >
              Repetir bloque
            </button>
            <button
              onClick={() => navigate('/history')}
              className={`w-full py-3 ${t.bg2} ${t.border} border rounded-xl text-sm font-semibold transition-all hover:shadow-sm ${t.text}`}
            >
              Ver historial completo
            </button>
            <button
              onClick={() => {
                setPhase('category')
                setSelectedCategory(null)
                setSelectedSubcategory(null)
                setSelectedBlock(null)
              }}
              className={`w-full py-3 text-sm font-semibold transition-all ${t.text3} hover:${t.text}`}
            >
              Elegir otra categoría
            </button>
          </div>
        </div>
      </div>
    )
  }

  // RACING SCREEN
  const currentPuzzle = puzzles[currentIdx]
  const progress = (solved / puzzles.length) * 100

  return (
    <div className={`min-h-screen ${t.bg} flex flex-col transition-colors duration-300`}>
      <div className={`${t.bg2} ${t.border} border-b sticky top-0 z-40 backdrop-blur-xl bg-opacity-95`}>
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>{selectedBlock?.name}</p>
              <div className="text-4xl font-bold" style={{ color: accentColor, letterSpacing: '-0.02em' }}>
                {formatTimerDisplay(elapsed)}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Progreso</p>
                <p className={`text-3xl font-bold ${t.text}`}>{solved}<span className={`text-lg font-semibold ${t.text2}`}>/{puzzles.length}</span></p>
              </div>
              <button
                onClick={toggleTheme}
                className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3} hover:${t.text}`}
              >
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>
          
          <div className={`h-1 ${t.track} rounded-full overflow-hidden`}>
            <div 
              className="h-full transition-all duration-300 rounded-full"
              style={{ width: `${progress}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center pt-8 px-6">
        <div className="w-full max-w-[560px]">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs uppercase tracking-widest font-semibold ${t.text3}`}>Puzzle {currentIdx + 1} de {puzzles.length}</span>
              {puzzleErrors > 0 && (
                <span className="text-xs px-2 py-1 rounded-md bg-red-500 bg-opacity-20 text-red-400">
                  {puzzleErrors} error{puzzleErrors !== 1 ? 'es' : ''}
                </span>
              )}
            </div>
          </div>
          
          {currentPuzzle && (
            <PuzzleBoard
              key={currentPuzzle.id}
              puzzle={currentPuzzle}
              onSolved={handleSolved}
              onError={handleError}
              onSkip={handleSkip}
              autoSkipAfterErrors={1}
            />
          )}
        </div>
      </div>
    </div>
  )
}
