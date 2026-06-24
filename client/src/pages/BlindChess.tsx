import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chess } from 'chess.js'
import { useAuth } from '../lib/auth'
import { fetchBlindPuzzle, advanceBlindPuzzle, BlindPuzzle } from '../lib/api'
const errorSound = new Audio('/sounds/error.mp3')
const correctSound = new Audio('/sounds/correct.mp3')
errorSound.preload = 'auto'
correctSound.preload = 'auto'

function normalizeNotation(input: string): string {
  return input
    .replace(/^D/g, 'Q').replace(/^T/g, 'R').replace(/^A/g, 'B').replace(/^C/g, 'N').replace(/^R(?=[a-h\d])/g, 'K')
    .replace(/xD/g, 'xQ').replace(/xT/g, 'xR').replace(/xA/g, 'xB').replace(/xC/g, 'xN')
}

const MEMORIZE_SECONDS = 30

function parseFenToPieces(fen: string): { white: string[]; black: string[] } {
  const board = fen.split(' ')[0]
  const white: string[] = []
  const black: string[] = []
  const pieceNames: Record<string, string> = {
    K: 'Rey', Q: 'Dama', R: 'Torre', B: 'Alfil', N: 'Caballo', P: 'Peón'
  }
  let rank = 8
  let file = 0
  for (const ch of board) {
    if (ch === '/') { rank--; file = 0; continue }
    if (!isNaN(Number(ch))) { file += Number(ch); continue }
    const square = 'abcdefgh'[file] + rank
    const name = pieceNames[ch.toUpperCase()] || ch.toUpperCase()
    if (ch === ch.toUpperCase()) white.push(`${name} ${square}`)
    else black.push(`${name} ${square}`)
    file++
  }
  return { white, black }
}

type Phase = 'memorize' | 'input' | 'opponent' | 'correct' | 'wrong'

export default function BlindChess() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [puzzle, setPuzzle] = useState<BlindPuzzle | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<Phase>('memorize')
  const [timeLeft, setTimeLeft] = useState(MEMORIZE_SECONDS)
  const [inputValue, setInputValue] = useState('')
  const [solutionIndex, setSolutionIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [opponentMove, setOpponentMove] = useState<string | null>(null)
  const [opponentTimeLeft, setOpponentTimeLeft] = useState(MEMORIZE_SECONDS)
  const [game, setGame] = useState<Chess | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadPuzzle = useCallback(async () => {
    setLoading(true)
    try {
      const p = await fetchBlindPuzzle()
      setPuzzle(p)
      const g = new Chess()
      g.load(p.fen)
      setGame(g)
      setPhase('memorize')
      setTimeLeft(MEMORIZE_SECONDS)
      setSolutionIndex(0)
      setInputValue('')
      setError(null)
      setOpponentMove(null)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadPuzzle()
  }, [user, navigate, loadPuzzle])

  // Timer de memorización
  useEffect(() => {
    if (phase !== 'memorize') return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          setPhase('input')
          setTimeout(() => inputRef.current?.focus(), 100)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [phase])

  // Timer del movimiento rival
  useEffect(() => {
    if (phase !== 'opponent') return
    setOpponentTimeLeft(MEMORIZE_SECONDS)
    timerRef.current = setInterval(() => {
      setOpponentTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          setOpponentMove(null)
          // Siguiente movimiento del jugador
          if (puzzle && solutionIndex + 2 < puzzle.solution.length) {
            setSolutionIndex(si => si + 2)
            setPhase('input')
            setTimeout(() => inputRef.current?.focus(), 100)
          } else {
            // Puzzle completado
            handleAdvance()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [phase])

  async function handleAdvance() {
    try {
      await advanceBlindPuzzle()
      correctSound.currentTime = 0; correctSound.play()
      setPhase('correct')
      setTimeout(() => loadPuzzle(), 1500)
    } catch (e) { console.error(e) }
  }

  function handleSubmit() {
    if (!puzzle || !game) return
    const input = inputValue.trim()
    if (!input) return

    const expectedSAN = puzzle.solution[solutionIndex]

    // Intentar el movimiento
    const gameCopy = new Chess()
    gameCopy.load(game.fen())

    const normalized = normalizeNotation(input)
    let moveResult
    try { moveResult = gameCopy.move(normalized) } catch { moveResult = null }
    if (!moveResult) {
       const cleanInput = input.replace(/[+#]/g, '').trim()
       try { moveResult = gameCopy.move(cleanInput) } catch { moveResult = null }
       if (!moveResult) {
        try { moveResult = gameCopy.move(input) } catch { }
       }
    }

    if (!moveResult) {
      setError('Notación inválida')
      return
    }

    // Verificar si es el movimiento correcto comparando from/to
    let expectedResult
    try {
       const tempGame = new Chess()
       tempGame.load(game.fen())
       const cleanExpected = expectedSAN.replace(/[+#]/g, '').trim()
       expectedResult = tempGame.move(cleanExpected)
    } catch { expectedResult = null }

    if (!expectedResult || moveResult.from !== expectedResult.from || moveResult.to !== expectedResult.to) {
      errorSound.currentTime = 0; errorSound.play()
      setError(`Incorrecto. La respuesta era: ${expectedSAN}`)
      setPhase('wrong')
      setTimeout(() => {
        setPhase('input')
        setError(null)
        setInputValue('')
        setTimeout(() => inputRef.current?.focus(), 100)
      }, 2000)
      return
    }

    // Movimiento correcto
    setGame(gameCopy)
    setInputValue('')
    setError(null)

    // Ver si hay respuesta rival
    const rivalIndex = solutionIndex + 1
    if (rivalIndex < puzzle.solution.length) {
      const rivalSAN = puzzle.solution[rivalIndex]
      // Ejecutar movimiento rival en el juego
      const gameWithRival = new Chess()
      gameWithRival.loadPgn(gameCopy.pgn())
      try { gameWithRival.move(rivalSAN) } catch { }
      setGame(gameWithRival)
      setOpponentMove(rivalSAN)
      setPhase('opponent')
    } else {
      // Puzzle completado
      handleAdvance()
    }
  }

  if (loading || !puzzle) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <p className="text-bone-3 font-mono text-sm animate-pulse">Cargando puzzle...</p>
      </div>
    )
  }

  const pieces = parseFenToPieces(puzzle.fen)
  const playerColor = puzzle.fen.split(' ')[1] === 'w' ? 'Blancas' : 'Negras'
  const rivalColor = playerColor === 'Blancas' ? 'Negras' : 'Blancas'

  return (
    <div className="min-h-screen bg-void text-bone flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-void-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/solo')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors">← Volver</button>
          <span className="font-mono text-sm text-bone-2">Ajedrez Ciego</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-bone-3">{puzzle.currentNumber} / {puzzle.total}</span>
          <button onClick={logout} className="text-bone-3 font-mono text-xs hover:text-red-400 transition-colors">Salir</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-void-4">
        <div className="h-full bg-amber transition-all duration-300" style={{ width: `${(puzzle.currentNumber / puzzle.total) * 100}%` }} />
      </div>

      <div className="flex-1 flex flex-col lg:flex-row items-start justify-center gap-8 p-6 max-w-4xl mx-auto w-full">

        {/* Tablero vacío */}
        <div className="flex flex-col items-center gap-4">
          <div className="font-mono text-xs text-bone-3 uppercase tracking-widest">Tablero</div>
          <div
            style={{ width: 320, height: 320 }}
            className="border border-void-4 rounded-sm overflow-hidden"
          >
            {/* Tablero vacío 8x8 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', width: 320, height: 320 }}>
              {Array.from({ length: 64 }).map((_, i) => {
                const row = Math.floor(i / 8)
                const col = i % 8
                const isDark = (row + col) % 2 === 1
                return (
                  <div
                    key={i}
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: isDark ? '#b58863' : '#f0d9b5',
                    }}
                  />
                )
              })}
            </div>
          </div>
          <div className="font-mono text-xs text-bone-3">Juegas con {playerColor}</div>
        </div>

        {/* Panel lateral */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* Posiciones */}
          {(phase === 'memorize' || phase === 'input' || phase === 'wrong') && (
            <div className={`space-y-4 transition-opacity duration-500 ${phase === 'memorize' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-bone-3 uppercase tracking-widest">Posición</span>
                {phase === 'memorize' && (
                  <span className={`font-mono text-sm font-bold ${timeLeft <= 10 ? 'text-red-400' : 'text-amber'}`}>
                    {timeLeft}s
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="font-mono text-xs text-amber mb-2">♔ Blancas</div>
                  <div className="flex flex-wrap gap-2">
                    {pieces.white.map((p, i) => (
                      <span key={i} className="font-mono text-xs bg-void-2 border border-void-4 px-2 py-1 rounded-sm text-bone">{p}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs text-bone-3 mb-2">♚ Negras</div>
                  <div className="flex flex-wrap gap-2">
                    {pieces.black.map((p, i) => (
                      <span key={i} className="font-mono text-xs bg-void-2 border border-void-4 px-2 py-1 rounded-sm text-bone">{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Respuesta rival */}
          {phase === 'opponent' && opponentMove && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-bone-3 uppercase tracking-widest">Respuesta rival ({rivalColor})</span>
                <span className={`font-mono text-sm font-bold ${opponentTimeLeft <= 10 ? 'text-red-400' : 'text-amber'}`}>
                  {opponentTimeLeft}s
                </span>
              </div>
              <div className="font-mono text-3xl font-bold text-amber">{opponentMove}</div>
              <p className="font-mono text-xs text-bone-3">Memoriza la respuesta rival...</p>
            </div>
          )}

          {/* Input */}
          {(phase === 'input' || phase === 'wrong') && (
            <div className="space-y-4">
              <div className="font-mono text-xs text-bone-3 uppercase tracking-widest">
                Tu movimiento ({playerColor}) — jugada {Math.floor(solutionIndex / 2) + 1}
              </div>

              {error && (
                <div className={`font-mono text-sm px-3 py-2 rounded-sm border ${phase === 'wrong' ? 'text-red-400 border-red-400/30 bg-red-400/5' : 'text-red-400 border-red-400/30'}`}>
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => { setInputValue(e.target.value); setError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="ej. Dh5+, Nf3, O-O"
                  className="flex-1 bg-void-2 border border-void-4 focus:border-amber outline-none font-mono text-sm text-bone px-3 py-2 rounded-sm placeholder:text-bone-3"
                  disabled={phase === 'wrong'}
                  autoComplete="off"
                />
                <button
                  onClick={handleSubmit}
                  disabled={phase === 'wrong'}
                  className="px-4 py-2 bg-amber hover:bg-amber/80 text-black font-mono font-bold text-sm rounded-sm transition-colors disabled:opacity-50"
                >
                  OK
                </button>
              </div>
              <p className="font-mono text-xs text-bone-3">Usa notación algebraica estándar. Enter para confirmar.</p>
            </div>
          )}

          {/* Correcto */}
          {phase === 'correct' && (
            <div className="text-center py-8">
              <div className="text-4xl font-bold text-green-400 font-mono mb-2">✓</div>
              <p className="font-mono text-sm text-green-400">¡Correcto! Cargando siguiente...</p>
            </div>
          )}

          {/* Memorize hint */}
          {phase === 'memorize' && (
            <div className="font-mono text-xs text-bone-3 border border-void-4 px-4 py-3 rounded-sm">
              Tienes {MEMORIZE_SECONDS} segundos para memorizar las posiciones. Luego tendrás que escribir el mejor movimiento.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
