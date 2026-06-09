import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getSocket } from '../lib/socket'
import { fetchPuzzlesByIds } from '../lib/api'
import { Puzzle, Player, RaceResult } from '../types'
import { useTimer } from '../hooks/useTimer'
import { formatTimerDisplay } from '../lib/time'
import PuzzleBoard from '../components/Board/PuzzleBoard'

interface LivePlayer {
  nickname: string
  solved: number
  totalPuzzles: number
  finished: boolean
}

// [CAMBIO 3] Registro de un puzzle fallado
interface FailedPuzzle {
  idx: number
  orderInBlock: number
  errors: number
}

export default function Race() {
  const { code } = useParams<{ code: string }>()
  const [params] = useSearchParams()
  const nickname = params.get('nickname') || 'Anon'
  const navigate = useNavigate()

  const [puzzles, setPuzzles] = useState<Puzzle[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [solved, setSolved] = useState(0)
  const [totalErrors, setTotalErrors] = useState(0)
  const [players, setPlayers] = useState<LivePlayer[]>([])
  const [racing, setRacing] = useState(false)
  const [finished, setFinished] = useState(false)
  // blockId removed from state
  const [totalPuzzles, setTotalPuzzles] = useState(0)
  const [puzzleErrors, setPuzzleErrors] = useState(0)
  // [CAMBIO 3] Puzzles fallados
  const [failedPuzzles, setFailedPuzzles] = useState<FailedPuzzle[]>([])

  const puzzleTimesRef = useRef<{ puzzleId: number; orderInBlock: number; timeMs: number; errors: number }[]>([])
  const puzzleStartRef = useRef<number>(Date.now())

  const { elapsed, reset: resetTimer } = useTimer(racing && !finished)

  useEffect(() => {
    const socket = getSocket()

    socket.on('race_data', async (data: { puzzleIds: number[]; totalPuzzles: number }) => {
      // blockId removed
      setTotalPuzzles(data.totalPuzzles)
      try {
        const fetchedPuzzles = await fetchPuzzlesByIds(data.puzzleIds)
        setPuzzles(fetchedPuzzles)
        setRacing(true)
        resetTimer()
        puzzleStartRef.current = Date.now()
      } catch (e) {
        console.error('Failed to load puzzles', e)
      }
    })

    socket.on('progress_update', (updates: LivePlayer[]) => {
      setPlayers(updates)
    })

    socket.on('race_finished', (results: RaceResult[]) => {
      navigate(`/results/${code}?nickname=${encodeURIComponent(nickname)}`, {
        state: { results },
      })
    })

    return () => {
      socket.off('race_data')
      socket.off('progress_update')
      socket.off('race_finished')
    }
  }, [code, nickname, navigate, resetTimer])

  // Avanza al siguiente puzzle, compartido entre onSolved y onSkip
  const advancePuzzle = useCallback(
    (timeMs: number, errors: number, idxOverride?: number) => {
      if (finished || !puzzles[idxOverride ?? currentIdx]) return
      const idx = idxOverride ?? currentIdx
      const puzzle = puzzles[idx]

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

      const socket = getSocket()
      socket.emit('puzzle_solved', {
        solved: newSolved,
        errors: errors,
        puzzleTimeMs: timeMs,
      })

      const nextIdx = idx + 1
      if (nextIdx >= puzzles.length) {
        setFinished(true)
        setRacing(false)
        socket.emit('race_complete', {
          totalTimeMs: elapsed,
          solved: newSolved,
          totalPuzzles: puzzles.length,
          errors: newErrors,
          puzzleTimes: puzzleTimesRef.current,
          blockId: undefined,
          nickname,
        })
      } else {
        setCurrentIdx(nextIdx)
        puzzleStartRef.current = Date.now()
      }
    },
    [solved, totalErrors, currentIdx, puzzles, finished, elapsed, nickname]
  )

  const handlePuzzleSolved = useCallback(
    (timeMs: number, errors: number) => {
      advancePuzzle(timeMs, errors)
    },
    [advancePuzzle]
  )

  // [CAMBIO 3] Skip automático
  const handleSkip = useCallback(
    (errors: number) => {
      const timeMs = Date.now() - puzzleStartRef.current
      setFailedPuzzles(prev => [
        ...prev,
        {
          idx: currentIdx,
          orderInBlock: puzzles[currentIdx]?.orderInBlock ?? currentIdx + 1,
          errors,
        },
      ])
      advancePuzzle(timeMs, errors, currentIdx)
    },
    [currentIdx, puzzles, advancePuzzle]
  )

  const handleError = useCallback(() => {
    setPuzzleErrors(prev => prev + 1)
  }, [])

  if (!racing && puzzles.length === 0) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <p className="text-bone-3 font-mono animate-pulse-amber">Cargando puzzles...</p>
      </div>
    )
  }

  const currentPuzzle = puzzles[currentIdx]
  const progress = (solved / (totalPuzzles || puzzles.length)) * 100

  const sortedPlayers = [...players].sort((a, b) => b.solved - a.solved)

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Top bar: timer + progress */}
      <div className="border-b border-void-4 bg-void-2">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          {/* Big timer */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-3xl font-mono font-bold text-amber tracking-tight">
                {formatTimerDisplay(elapsed)}
              </div>
              <div className="text-bone-3 font-mono text-xs mt-0.5">tiempo</div>
            </div>
            {puzzleErrors > 0 && (
              <div className="text-red-400 font-mono text-sm">
                {puzzleErrors} error{puzzleErrors !== 1 ? 'es' : ''} aquí
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xl font-mono font-bold text-bone">
                {solved}
                <span className="text-bone-3 font-bold">/{totalPuzzles || puzzles.length}</span>
              </div>
              <div className="text-bone-3 font-mono text-xs">resueltos</div>
            </div>
            <div className="w-32 h-2 bg-void-4 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex gap-0 max-w-6xl mx-auto w-full px-0 sm:px-4 py-4 sm:py-6">
        {/* Board */}
        <div className="flex-1 flex items-start justify-center">
          {currentPuzzle && (
            <div className="w-full max-w-[540px]">
              {/* Puzzle counter */}
              <div className="flex items-center justify-between mb-4 px-4 sm:px-0">
                <span className="font-mono text-bone-3 text-xs uppercase tracking-widest">
                  Puzzle {currentIdx + 1}
                </span>
                <span className="font-mono text-bone-3 text-xs">
                  #{currentPuzzle.orderInBlock} del bloque
                </span>
              </div>
              <PuzzleBoard
                key={currentPuzzle.id}
                puzzle={currentPuzzle}
                onSolved={handlePuzzleSolved}
                onError={handleError}
                onSkip={handleSkip}
                autoSkipAfterErrors={1}
                disabled={finished}
              />
            </div>
          )}
          {finished && (
            <div className="text-center animate-slide-up w-full max-w-[540px]">
              <div className="text-6xl font-mono font-bold text-amber mb-4">
                {formatTimerDisplay(elapsed)}
              </div>
              <p className="text-bone font-mono text-xl mb-2">¡Completado!</p>
              <p className="text-bone-3 font-mono text-sm mb-6">
                {solved} puzzles · {totalErrors} errores
              </p>

              {/* [CAMBIO 3] Resumen de puzzles fallados */}
              {failedPuzzles.length > 0 ? (
                <div className="text-left bg-void-2 border border-red-900/40 rounded-sm px-4 py-3 mb-4">
                  <p className="font-mono text-xs text-red-400 uppercase tracking-widest mb-2">
                    ✗ Ejercicios con errores ({failedPuzzles.length})
                  </p>
                  <div className="space-y-1">
                    {failedPuzzles.map((fp, i) => (
                      <div key={i} className="flex items-center justify-between font-mono text-sm">
                        <span className="text-bone">
                          Puzzle {fp.idx + 1}
                          <span className="text-bone-3 ml-1">(#{fp.orderInBlock})</span>
                        </span>
                        <span className="text-red-400">{fp.errors} error{fp.errors !== 1 ? 'es' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-4 bg-void-2 border border-green-900/40 rounded-sm px-4 py-2">
                  <p className="font-mono text-xs text-green-400 uppercase tracking-widest">✓ Sin errores de skip</p>
                </div>
              )}

              <p className="text-bone-3 font-mono text-sm animate-pulse-amber">
                Esperando resultados finales...
              </p>
            </div>
          )}
        </div>

        {/* Live scoreboard - hidden on mobile */}
        <div className="hidden sm:block w-56 ml-8 flex-shrink-0">
          <div className="sticky top-6">
            <p className="text-bone-3 font-mono text-xs uppercase tracking-widest mb-3">
              En vivo
            </p>
            <div className="space-y-2">
              {sortedPlayers.map((player, i) => (
                <div
                  key={player.nickname}
                  className={`px-3 py-2 rounded-sm border transition-all ${
                    player.nickname === nickname
                      ? 'border-amber/40 bg-amber/5'
                      : 'border-void-4 bg-void-2'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-bone-3 text-xs w-4">{i + 1}</span>
                    <span
                      className={`font-mono text-xs truncate flex-1 ${
                        player.nickname === nickname ? 'text-amber' : 'text-bone'
                      }`}
                    >
                      {player.nickname}
                    </span>
                    {player.finished && (
                      <span className="text-green font-mono text-xs">✓</span>
                    )}
                  </div>
                  <div className="mt-1.5 h-1 bg-void-4 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        player.finished ? 'bg-green' : player.nickname === nickname ? 'bg-amber' : 'bg-bone-3'
                      }`}
                      style={{
                        width: `${(player.solved / (totalPuzzles || 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="font-mono text-xs text-bone-3 mt-1">
                    {player.solved}/{totalPuzzles}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
