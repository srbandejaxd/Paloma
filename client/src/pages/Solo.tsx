import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBlocks, fetchPuzzlesForBlock, saveAttempt } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Block, Puzzle } from '../types'
import { useTimer } from '../hooks/useTimer'
import { formatTimerDisplay, formatTimeLong } from '../lib/time'
import PuzzleBoard from '../components/Board/PuzzleBoard'

type Phase = 'category' | 'subcategory' | 'select' | 'racing' | 'done'

const CATEGORIES = [
  { id: "checkmate_patterns", label: "The Checkmate Patterns Manual", description: "El Manual de patrones de mate te muestra los 34 patrones de mate que todo jugador de ajedrez debe conocer.", icon: '♚' },
  { id: "palomita", label: "Woodpecker Method", description: "Puzzles Faciles, Intermedios y Dificiles", icon: '🪃' },
  { id: "woodpecker_method2", label: "Woodpecker Method 2", description: "Puzzles Posicionales", icon: '♞' },
]

const NAV_LINKS = [
  { path: '/puzzles', label: 'Puzzles' },
  { path: '/vision', label: 'Visión' },
  { path: '/history', label: 'Historial' },
  { path: '/leaderboard', label: 'Ranking' },
  { path: '/blind', label: 'Ciego' },
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
  const blocksForSelection = hasSubcategories
    ? blocksForCategory.filter(b => b.subcategory === selectedSubcategory)
    : blocksForCategory

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

  // ── THEME TOKENS (mirrors Home.tsx) ─────────────────────────────────────────
  const t = dark ? {
    bg: 'bg-[#0A0A0F]',
    bg2: 'bg-[#12121A]',
    bg3: 'bg-[#1C1C28]',
    border: 'border-[#252535]',
    text: 'text-[#E8E6E0]',
    text2: 'text-[#B8B5AC]',
    text3: 'text-[#7A776E]',
    accent: 'text-[#D4A017]',
    accentBg: 'bg-[#D4A017]',
    accentBorder: 'border-[#D4A017]',
    inputBg: 'bg-[#12121A] border-[#252535] focus:border-[#D4A017]',
    cardBg: 'bg-[#12121A] border-[#252535]',
    cardBgHover: 'hover:border-[#D4A017]',
    pill: 'bg-[#1C1C28] border-[#252535]',
    toggleBg: 'bg-[#1C1C28] border-[#252535] text-[#7A776E] hover:text-[#E8E6E0]',
    heroBadge: 'bg-[#1C1C28] border-[#252535] text-[#D4A017]',
    divider: 'border-[#252535]',
    footerText: 'text-[#252535]',
    track: 'bg-[#252535]',
    red: '#E74C3C',
    green: '#2ECC71',
  } : {
    bg: 'bg-[#F5F0E8]',
    bg2: 'bg-[#EDE8DF]',
    bg3: 'bg-[#E2DBD0]',
    border: 'border-[#D4CABF]',
    text: 'text-[#1A1814]',
    text2: 'text-[#4A4640]',
    text3: 'text-[#8A8478]',
    accent: 'text-[#A07810]',
    accentBg: 'bg-[#A07810]',
    accentBorder: 'border-[#A07810]',
    inputBg: 'bg-[#EDE8DF] border-[#D4CABF] focus:border-[#A07810]',
    cardBg: 'bg-[#EDE8DF] border-[#D4CABF]',
    cardBgHover: 'hover:border-[#A07810]',
    pill: 'bg-[#E2DBD0] border-[#D4CABF]',
    toggleBg: 'bg-[#E2DBD0] border-[#D4CABF] text-[#8A8478] hover:text-[#1A1814]',
    heroBadge: 'bg-[#E2DBD0] border-[#D4CABF] text-[#A07810]',
    divider: 'border-[#D4CABF]',
    footerText: 'text-[#D4CABF]',
    track: 'bg-[#D4CABF]',
    red: '#C0392B',
    green: '#27965A',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'
  const accentSoft = dark ? 'text-[#0A0A0F]' : 'text-[#F5F0E8]'

  // ── SHARED: top nav (mirrors Home.tsx fixed nav) ────────────────────────────
  function TopNav() {
    return (
      <nav className={`fixed top-0 left-0 right-0 z-50 ${t.bg} border-b ${t.border} backdrop-blur-sm bg-opacity-90`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🪃</span>
            <span className={`font-bold text-sm tracking-widest uppercase ${t.text}`}>Woodpecker</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`hidden md:flex items-center gap-1 border rounded-sm p-1 ${t.pill}`}>
              {NAV_LINKS.map(link => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest rounded-sm transition-colors ${t.text3} hover:${t.text}`}
                >
                  {link.label}
                </button>
              ))}
            </div>
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 border rounded-sm text-xs ${t.heroBadge}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
              <span className="font-mono">{user?.nickname}</span>
            </div>
            <button
              onClick={toggleTheme}
              className={`p-2 border rounded-sm transition-all ${t.toggleBg}`}
              title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              onClick={logout}
              className={`px-3 py-2 border rounded-sm font-mono text-xs uppercase tracking-widest transition-colors ${t.border} ${t.text3} hover:text-red-500`}
            >
              Salir
            </button>
          </div>
        </div>
      </nav>
    )
  }

  function MobileSubNav() {
    return (
      <div className={`md:hidden flex items-center gap-1 border rounded-sm p-1 mb-8 overflow-x-auto ${t.pill}`}>
        {NAV_LINKS.map(link => (
          <button
            key={link.path}
            onClick={() => navigate(link.path)}
            className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest rounded-sm whitespace-nowrap transition-colors ${t.text3} hover:${t.text}`}
          >
            {link.label}
          </button>
        ))}
      </div>
    )
  }

  // ── CATEGORY ─────────────────────────────────────────────────────────────────
  if (phase === 'category') {
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300`}>
        <TopNav />
        <div className="pt-32 pb-20 px-6">
          <div className="max-w-3xl mx-auto animate-slide-up">
            <MobileSubNav />

            <div className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-sm text-xs tracking-widest uppercase mb-6 ${t.heroBadge}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
              Modo Solo
            </div>

            <h1 className={`text-4xl font-bold leading-none mb-3 ${t.text}`} style={{ letterSpacing: '-0.02em' }}>
              Elige una <span style={{ color: accentColor }}>categoría</span>
            </h1>
            <p className={`text-sm leading-relaxed mb-10 max-w-md ${t.text2}`}>
              ¿Qué quieres entrenar hoy? Cada categoría contiene bloques con sus propios puzzles y su propio historial de ciclos.
            </p>

            <div className="grid md:grid-cols-3 gap-4">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id)
                    setSelectedSubcategory(null)
                    const catBlocks = blocks.filter(b => b.category === cat.id)
                    const subs = [...new Set(catBlocks.map(b => b.subcategory).filter(Boolean))]
                    setPhase(subs.length > 0 ? 'subcategory' : 'select')
                  }}
                  className={`text-left border rounded-sm p-6 transition-all group ${t.cardBg} ${t.cardBgHover}`}
                >
                  <div className="text-2xl mb-4">{cat.icon}</div>
                  <div className={`text-sm font-bold mb-2 ${t.text}`}>{cat.label}</div>
                  <div className={`text-xs leading-relaxed mb-4 ${t.text3}`}>{cat.description}</div>
                  <div className="flex items-center gap-1 text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accentColor }}>
                    Empezar <span>→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SUBCATEGORY ────────────────────────────────────────────────────────────
  if (phase === 'subcategory') {
    const catLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300`}>
        <TopNav />
        <div className="pt-32 pb-20 px-6">
          <div className="max-w-3xl mx-auto animate-slide-up">
            <button onClick={() => setPhase('category')} className={`text-xs mb-6 block ${t.text3} hover:${t.text} transition-colors`}>← Categorías</button>

            <p className={`text-xs uppercase tracking-widest mb-2 ${t.text3}`}>{catLabel}</p>
            <h2 className={`text-3xl font-bold mb-8 ${t.text}`} style={{ letterSpacing: '-0.02em' }}>Elige una subcategoría</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              {subcategoriesForCategory.map(sub => {
                const subBlocks = blocksForCategory.filter(b => b.subcategory === sub)
                return (
                  <button
                    key={sub}
                    onClick={() => { setSelectedSubcategory(sub); setPhase('select') }}
                    className={`text-left border rounded-sm p-5 transition-all group ${t.cardBg} ${t.cardBgHover}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`text-sm font-bold ${t.text}`}>{sub}</div>
                        <div className={`text-xs mt-1 ${t.text3}`}>{subBlocks.length} bloque{subBlocks.length !== 1 ? 's' : ''}</div>
                      </div>
                      <span className="text-lg opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accentColor }}>→</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (phase === 'select') {
    const catLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300`}>
        <TopNav />
        <div className="pt-32 pb-20 px-6">
          <div className="max-w-3xl mx-auto animate-slide-up">
            <button onClick={() => setPhase(hasSubcategories ? 'subcategory' : 'category')} className={`text-xs mb-6 block ${t.text3} hover:${t.text} transition-colors`}>← Categorías</button>

            <p className={`text-xs uppercase tracking-widest mb-2 ${t.text3}`}>{catLabel}{selectedSubcategory ? ` · ${selectedSubcategory}` : ''}</p>
            <h2 className={`text-3xl font-bold mb-2 ${t.text}`} style={{ letterSpacing: '-0.02em' }}>Elige un bloque</h2>
            <p className={`text-sm mb-8 ${t.text2}`}>Cada repetición del bloque es un cycle. Tu tiempo baja — eso es el método funcionando.</p>

            <div className="space-y-3">
              {blocksForSelection.map(block => (
                <button
                  key={block.id}
                  onClick={() => startSolo(block)}
                  className={`w-full flex items-center justify-between text-left border rounded-sm px-5 py-4 transition-all group ${t.cardBg} ${t.cardBgHover}`}
                >
                  <div>
                    <div className={`text-sm font-bold ${t.text}`}>{block.name}</div>
                    {block.description && <div className={`text-xs mt-0.5 ${t.text3}`}>{block.description}</div>}
                  </div>
                  <div className="text-right shrink-0 pl-4">
                    <div className={`text-xs ${t.text3}`}>{block.puzzleCount} puzzles</div>
                    <div className="text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: accentColor }}>Iniciar →</div>
                  </div>
                </button>
              ))}

              {blocksForSelection.length === 0 && (
                <div className={`border rounded-sm p-8 text-center ${t.cardBg}`}>
                  <p className={`text-sm ${t.text3}`}>No hay bloques disponibles en esta selección.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} font-mono flex items-center justify-center p-6 transition-colors duration-300`}>
        <div className="w-full max-w-sm text-center animate-slide-up">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-sm text-xs tracking-widest uppercase mb-8 ${t.heroBadge}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
            Cycle completado
          </div>

          <div className={`border rounded-sm p-8 mb-4 ${t.cardBg}`}>
            <div className="text-6xl font-bold mb-2 tracking-tight" style={{ letterSpacing: '-0.02em', color: accentColor }}>
              {formatTimeLong(finalTime)}
            </div>
            <p className={`text-sm ${t.text3}`}>{solved}/{puzzles.length} resueltos · {totalErrors} errores</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => startSolo(selectedBlock!)}
              className={`w-full py-3.5 ${t.accentBg} ${accentSoft} font-bold text-sm tracking-widest uppercase rounded-sm hover:opacity-90 transition-opacity`}
            >
              Repetir bloque
            </button>
            <button
              onClick={() => navigate('/history')}
              className={`w-full py-3 border rounded-sm text-sm transition-colors ${t.cardBg} ${t.text} hover:border-opacity-70`}
            >
              Ver historial
            </button>
            <button
              onClick={() => setPhase('category')}
              className={`w-full py-3 text-sm transition-colors ${t.text3} hover:${t.text}`}
            >
              Elegir otra categoría
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RACING ─────────────────────────────────────────────────────────────────
  const currentPuzzle = puzzles[currentIdx]
  const progress = (solved / puzzles.length) * 100

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono flex flex-col transition-colors duration-300`}>
      <div className={`border-b ${t.border} ${t.bg2}`}>
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-3xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em', color: accentColor }}>
              {formatTimerDisplay(elapsed)}
            </div>
            <div className={`text-xs ${t.text3}`}>{selectedBlock?.name}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={`text-xl font-bold ${t.text}`}>{solved}<span className={t.text3}>/{puzzles.length}</span></div>
              {puzzleErrors > 0 && <div className="text-red-400 text-xs">{puzzleErrors} error{puzzleErrors !== 1 ? 'es' : ''}</div>}
            </div>
            <button
              onClick={toggleTheme}
              className={`p-2 border rounded-sm transition-all ${t.toggleBg}`}
              title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
        <div className={`h-1 ${t.track}`}>
          <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: accentColor }} />
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center pt-4 sm:pt-8 px-0 sm:px-4">
        <div className="w-full max-w-[540px]">
          <div className="flex items-center justify-between mb-4 px-4 sm:px-0">
            <span className={`text-xs uppercase tracking-widest ${t.text3}`}>Puzzle {currentIdx + 1}</span>
            <span className={`text-xs ${t.text3}`}>#{currentPuzzle?.orderInBlock} del bloque</span>
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
