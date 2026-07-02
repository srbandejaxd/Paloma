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
  { id: 'woodpecker2', label: 'Woodpecker 2', description: 'Método de repetición de puzzles posicionales' },
  { id: "checkmate_patterns", label: "The Checkmate Patterns Manual", description: "El Manual de patrones de mate te muestra los 34 patrones de mate que todo jugador de ajedrez debe conocer." },
  { id: "casa", label: "Pajaro loco", description: "Puzzles" },
]

interface FailedPuzzle {
  puzzleId: number
  idx: number
  orderInBlock: number
  errors: number
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

  const puzzleTimesRef = useRef<{ puzzleId: number; orderInBlock: number; timeMs: number; errors: number }[]>([])
  const puzzleStartRef = useRef<number>(Date.now())
  const solvedRef = useRef(0)
  const totalErrorsRef = useRef(0)

  const { elapsed, reset: resetTimer } = useTimer(phase === 'racing')

  useEffect(() => { solvedRef.current = solved }, [solved])
  useEffect(() => { totalErrorsRef.current = totalErrors }, [totalErrors])

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

  // ── CATEGORY ─────────────────────────────────────────────────────────────────
  if (phase === 'category') {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md animate-slide-up">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-bone-3 font-mono text-xs">Bienvenido,</p>
              <p className="text-amber font-mono font-bold">{user?.nickname}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => navigate('/puzzles')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors px-3 py-1.5 border border-void-4 hover:border-bone-3 rounded-sm">Puzzles</button>
              <button onClick={() => navigate('/vision')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors px-3 py-1.5 border border-void-4 hover:border-bone-3 rounded-sm">Visión</button>
              <button onClick={() => navigate('/history')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors px-3 py-1.5 border border-void-4 hover:border-bone-3 rounded-sm">Historial</button>
              <button onClick={() => navigate('/leaderboard')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors px-3 py-1.5 border border-void-4 hover:border-bone-3 rounded-sm">Ranking</button>
              <button onClick={() => navigate('/blind')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors px-3 py-1.5 border border-void-4 hover:border-bone-3 rounded-sm">Ciego</button>
              <button onClick={logout} className="text-bone-3 font-mono text-xs hover:text-red-400 transition-colors">Salir</button>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-mono font-bold text-bone">Elige una categoría</h2>
            <p className="text-bone-3 font-mono text-sm mt-1">¿Qué quieres entrenar hoy?</p>
          </div>

          <div className="space-y-3">
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
                className="w-full flex items-center justify-between px-5 py-5 bg-void-2 border border-void-4 hover:border-amber rounded-sm transition-all group"
              >
                <div className="text-left">
                  <div className="font-mono text-base font-bold text-bone group-hover:text-amber transition-colors">{cat.label}</div>
                  <div className="font-mono text-xs text-bone-3 mt-1">{cat.description}</div>
                </div>
                <span className="font-mono text-amber text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── SUBCATEGORY ────────────────────────────────────────────────────────────
  if (phase === 'subcategory') {
    const catLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md animate-slide-up">
          <button onClick={() => setPhase('category')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors mb-6 block">← Categorías</button>
          <div className="mb-8">
            <p className="text-bone-3 font-mono text-xs uppercase tracking-widest mb-1">{catLabel}</p>
            <h2 className="text-2xl font-mono font-bold text-bone">Elige una subcategoría</h2>
          </div>
          <div className="space-y-3">
            {subcategoriesForCategory.map(sub => {
              const subBlocks = blocksForCategory.filter(b => b.subcategory === sub)
              return (
                <button
                  key={sub}
                  onClick={() => { setSelectedSubcategory(sub); setPhase('select') }}
                  className="w-full flex items-center justify-between px-5 py-5 bg-void-2 border border-void-4 hover:border-amber rounded-sm transition-all group"
                >
                  <div className="text-left">
                    <div className="font-mono text-base font-bold text-bone group-hover:text-amber transition-colors">{sub}</div>
                    <div className="font-mono text-xs text-bone-3 mt-1">{subBlocks.length} bloque{subBlocks.length !== 1 ? 's' : ''}</div>
                  </div>
                  <span className="font-mono text-amber text-lg opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (phase === 'select') {
    const catLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md animate-slide-up">
          <button onClick={() => setPhase(hasSubcategories ? 'subcategory' : 'category')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors mb-6 block">← Categorías</button>

          <div className="mb-8">
            <p className="text-bone-3 font-mono text-xs uppercase tracking-widest mb-1">{catLabel}</p>
            <h2 className="text-2xl font-mono font-bold text-bone">Elige un bloque</h2>
            <p className="text-bone-3 font-mono text-sm mt-1">Cada repetición del bloque es un cycle</p>
          </div>

          <div className="space-y-2">
            {blocksForSelection.map(block => (
              <button
                key={block.id}
                onClick={() => startSolo(block)}
                className="w-full flex items-center justify-between px-5 py-4 bg-void-2 border border-void-4 hover:border-amber rounded-sm transition-all group"
              >
                <div>
                  <div className="font-mono text-sm text-bone group-hover:text-amber transition-colors">{block.name}</div>
                  {block.description && <div className="font-mono text-xs text-bone-3 mt-0.5">{block.description}</div>}
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-bone-3">{block.puzzleCount} puzzles</div>
                  <div className="font-mono text-xs text-amber opacity-0 group-hover:opacity-100 transition-opacity">Iniciar →</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center animate-slide-up">
          <p className="text-bone-3 font-mono text-xs uppercase tracking-widest mb-6">Cycle completado</p>
          <div className="text-6xl font-mono font-bold text-amber mb-1">{formatTimeLong(finalTime)}</div>
          <p className="text-bone-3 font-mono text-sm mb-8">{totalErrors} errores</p>
          <div className="space-y-3">
            <button onClick={() => startSolo(selectedBlock!)} className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm">
              Repetir bloque
            </button>
            <button onClick={() => navigate('/history')} className="w-full py-3 bg-void-3 text-bone font-mono text-sm border border-void-4 hover:border-bone-3 transition-colors rounded-sm">
              Ver historial
            </button>
            <button onClick={() => setPhase('category')} className="w-full py-3 text-bone-3 font-mono text-sm hover:text-bone transition-colors">
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
    <div className="min-h-screen bg-void flex flex-col">
      <div className="border-b border-void-4 bg-void-2">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-3xl font-mono font-bold text-amber tracking-tight">{formatTimerDisplay(elapsed)}</div>
            <div className="text-bone-3 font-mono text-xs">{selectedBlock?.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-bone">{solved}<span className="text-bone-3">/{puzzles.length}</span></div>
            {puzzleErrors > 0 && <div className="text-red-400 font-mono text-xs">{puzzleErrors} error{puzzleErrors !== 1 ? 'es' : ''}</div>}
          </div>
        </div>
        <div className="h-1 bg-void-4">
          <div className="h-full bg-amber transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center pt-4 sm:pt-8 px-0 sm:px-4">
        <div className="w-full max-w-[540px]">
          <div className="flex items-center justify-between mb-4 px-4 sm:px-0">
            <span className="font-mono text-bone-3 text-xs uppercase tracking-widest">Puzzle {currentIdx + 1}</span>
            <span className="font-mono text-bone-3 text-xs">#{currentPuzzle?.orderInBlock} del bloque</span>
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
