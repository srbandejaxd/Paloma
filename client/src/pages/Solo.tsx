import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchBlocks, fetchPuzzlesForBlock, saveAttempt } from '../lib/api'
import { Block, Puzzle } from '../types'
import { useTimer } from '../hooks/useTimer'
import { formatTimerDisplay, formatTimeLong, calcAccuracy } from '../lib/time'
import PuzzleBoard from '../components/Board/PuzzleBoard'

type Phase = 'select' | 'racing' | 'done'

// [CAMBIO 3] Registro de un puzzle fallado
interface FailedPuzzle {
  idx: number
  orderInBlock: number
  errors: number
}

export default function Solo() {
  const [searchParams] = useSearchParams()
  const nickname = searchParams.get('nickname') || 'Anon'
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('select')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null)
  const [puzzles, setPuzzles] = useState<Puzzle[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [solved, setSolved] = useState(0)
  const [totalErrors, setTotalErrors] = useState(0)
  const [puzzleErrors, setPuzzleErrors] = useState(0)
  const [finalTime, setFinalTime] = useState(0)
  // [CAMBIO 3] Puzzles en los que el usuario falló
  const [failedPuzzles, setFailedPuzzles] = useState<FailedPuzzle[]>([])

  const puzzleTimesRef = useRef<{ puzzleId: number; orderInBlock: number; timeMs: number; errors: number }[]>([])
  const puzzleStartRef = useRef<number>(Date.now())

  const { elapsed, reset: resetTimer } = useTimer(phase === 'racing')

  useEffect(() => {
    fetchBlocks().then(setBlocks).catch(console.error)
  }, [])

  async function startSolo(block: Block) {
    setSelectedBlock(block)
    const fetchedPuzzles = await fetchPuzzlesForBlock(block.id)
    setPuzzles(fetchedPuzzles)
    setCurrentIdx(0)
    setSolved(0)
    setTotalErrors(0)
    setFailedPuzzles([])
    puzzleTimesRef.current = []
    puzzleStartRef.current = Date.now()
    resetTimer()
    setPhase('racing')
  }

  // Avanza al siguiente puzzle (compartido por onSolved y onSkip)
  const advancePuzzle = useCallback(
    async (
      timeMs: number,
      errors: number,
      idxOverride?: number,
      skipped?: boolean
    ) => {
      if (!selectedBlock) return
      const idx = idxOverride ?? currentIdx
      const puzzle = puzzles[idx]
      if (!puzzle) return

      puzzleTimesRef.current.push({
        puzzleId: puzzle.id,
        orderInBlock: puzzle.orderInBlock,
        timeMs,
        errors,
      })

      const newSolved = solved + 1
      const newErrors = totalErrors + errors
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
            nickname,
            blockId: selectedBlock.id,
            totalTimeMs: total,
            solved: newSolved,
            totalPuzzles: puzzles.length,
            errors: newErrors,
            puzzleTimes: puzzleTimesRef.current,
          })
        } catch (e) {
          console.error('Failed to save attempt', e)
        }
      } else {
        setCurrentIdx(nextIdx)
        puzzleStartRef.current = Date.now()
      }
    },
    [solved, totalErrors, currentIdx, puzzles, elapsed, selectedBlock, nickname]
  )

  const handleSolved = useCallback(
    (timeMs: number, errors: number) => {
      advancePuzzle(timeMs, errors)
    },
    [advancePuzzle]
  )

  // [CAMBIO 3] Skip automático cuando se superan los errores permitidos
  const handleSkip = useCallback(
    (errors: number) => {
      const timeMs = Date.now() - puzzleStartRef.current
      // Registrar como fallado
      setFailedPuzzles(prev => [
        ...prev,
        {
          idx: currentIdx,
          orderInBlock: puzzles[currentIdx]?.orderInBlock ?? currentIdx + 1,
          errors,
        },
      ])
      advancePuzzle(timeMs, errors, currentIdx, true)
    },
    [currentIdx, puzzles, advancePuzzle]
  )

  const handleError = useCallback(() => {
    setPuzzleErrors(prev => prev + 1)
  }, [])

  if (phase === 'select') {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md animate-slide-up">
          <button
            onClick={() => navigate('/')}
            className="text-bone-3 font-mono text-xs hover:text-bone transition-colors mb-8 block"
          >
            ← Inicio
          </button>
          <div className="mb-8">
            <h2 className="text-2xl font-mono font-bold text-bone">Práctica individual</h2>
            <p className="text-bone-3 font-mono text-sm mt-1">
              <span className="text-amber">{nickname}</span> — elige un bloque
            </p>
          </div>
          <div className="space-y-2">
            {blocks.map(block => (
              <button
                key={block.id}
                onClick={() => startSolo(block)}
                className="w-full flex items-center justify-between px-5 py-4 bg-void-2 border border-void-4 hover:border-amber rounded-sm transition-all group"
              >
                <div>
                  <div className="font-mono text-sm text-bone group-hover:text-amber transition-colors">
                    {block.name}
                  </div>
                  {block.description && (
                    <div className="font-mono text-xs text-bone-3 mt-0.5">{block.description}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-bone-3">{block.puzzleCount} puzzles</div>
                  <div className="font-mono text-xs text-amber opacity-0 group-hover:opacity-100 transition-opacity">
                    Iniciar →
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const accuracy = calcAccuracy(solved, totalErrors)
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center animate-slide-up">
          <p className="text-bone-3 font-mono text-xs uppercase tracking-widest mb-6">Bloque completado</p>
          <div className="text-6xl font-mono font-bold text-amber mb-2">
            {formatTimeLong(finalTime)}
          </div>
          <p className="text-bone-3 font-mono text-sm mb-6">
            {solved}/{puzzles.length} puzzles · {totalErrors} errores · {accuracy}% precisión
          </p>

          {/* [CAMBIO 3] Resumen de puzzles fallados */}
          {failedPuzzles.length > 0 ? (
            <div className="mb-6 text-left bg-void-2 border border-red-900/40 rounded-sm px-4 py-3">
              <p className="font-mono text-xs text-red-400 uppercase tracking-widest mb-2">
                ✗ Ejercicios con errores ({failedPuzzles.length})
              </p>
              <div className="space-y-1">
                {failedPuzzles.map((fp, i) => (
                  <div key={i} className="flex items-center justify-between font-mono text-sm">
                    <span className="text-bone">
                      Puzzle {fp.idx + 1}
                      <span className="text-bone-3 ml-1">(#{fp.orderInBlock} del bloque)</span>
                    </span>
                    <span className="text-red-400">{fp.errors} error{fp.errors !== 1 ? 'es' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-6 bg-void-2 border border-green-900/40 rounded-sm px-4 py-3">
              <p className="font-mono text-xs text-green-400 uppercase tracking-widest">
                ✓ ¡Sin errores de skip!
              </p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => startSolo(selectedBlock!)}
              className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm"
            >
              Repetir bloque
            </button>
            <button
              onClick={() => navigate(`/history?nickname=${encodeURIComponent(nickname)}`)}
              className="w-full py-3 bg-void-3 text-bone font-mono text-sm border border-void-4 hover:border-bone-3 transition-colors rounded-sm"
            >
              Ver historial
            </button>
            <button
              onClick={() => setPhase('select')}
              className="w-full py-3 text-bone-3 font-mono text-sm hover:text-bone transition-colors"
            >
              Elegir otro bloque
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Racing phase
  const currentPuzzle = puzzles[currentIdx]
  const progress = (solved / puzzles.length) * 100

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Header */}
      <div className="border-b border-void-4 bg-void-2">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-3xl font-mono font-bold text-amber tracking-tight">
              {formatTimerDisplay(elapsed)}
            </div>
            <div className="text-bone-3 font-mono text-xs">
              {selectedBlock?.name}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-bone">
              {solved}<span className="text-bone-3">/{puzzles.length}</span>
            </div>
            {puzzleErrors > 0 && (
              <div className="text-red-400 font-mono text-xs">
                {puzzleErrors} error{puzzleErrors !== 1 ? 'es' : ''} aquí
              </div>
            )}
          </div>
        </div>
        <div className="h-1 bg-void-4">
          <div
            className="h-full bg-amber transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex items-start justify-center pt-8 px-4">
        <div className="w-full max-w-[540px]">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-bone-3 text-xs uppercase tracking-widest">
              Puzzle {currentIdx + 1}
            </span>
            <span className="font-mono text-bone-3 text-xs">
              #{currentPuzzle?.orderInBlock} del bloque
            </span>
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
