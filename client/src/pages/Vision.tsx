import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { useAuth } from '../lib/auth'
import { saveVisionSession } from '../lib/api'


const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8']
const DURATION = 60 // seconds

function randomSquare(exclude?: string): string {
  let sq: string
  do {
    sq = FILES[Math.floor(Math.random() * 8)] + RANKS[Math.floor(Math.random() * 8)]
  } while (sq === exclude)
  return sq
}

type Phase = 'idle' | 'playing' | 'done'

export default function Vision() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const boardSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 320 : 480
  const [phase, setPhase] = useState<Phase>('idle')
  const [target, setTarget] = useState<string>('')
  const [score, setScore] = useState(0)
  const [errors, setErrors] = useState(0)
  const [timeLeft, setTimeLeft] = useState(DURATION)
  const [flash, setFlash] = useState<{ sq: string; correct: boolean } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [bestScore, setBestScore] = useState<number | null>(null)

  const scoreRef = useRef(0)
  const errorsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load best score from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('vision_coords_best')
    if (stored) setBestScore(Number(stored))
  }, [])

  const endGame = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('done')
    const finalScore = scoreRef.current
    const finalErrors = errorsRef.current
    // Update local best
    const stored = localStorage.getItem('vision_coords_best')
    const prev = stored ? Number(stored) : 0
    if (finalScore > prev) {
      localStorage.setItem('vision_coords_best', String(finalScore))
      setBestScore(finalScore)
    }
    // Save to server
    try {
      await saveVisionSession({ mode: 'coordinates', score: finalScore, errors: finalErrors, durationMs: DURATION * 1000 })
    } catch { /* silent */ }
  }, [])

  const startGame = useCallback(() => {
    scoreRef.current = 0
    errorsRef.current = 0
    setScore(0)
    setErrors(0)
    setTimeLeft(DURATION)
    setFlash(null)
    setTarget(randomSquare())
    setPhase('playing')

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          endGame()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [endGame])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const handleSquareClick = useCallback((square: string) => {
    if (phase !== 'playing') return
    const correct = square === target
    setFlash({ sq: square, correct })
    setTimeout(() => setFlash(null), 300)

    if (correct) {
      scoreRef.current += 1
      setScore(s => s + 1)
      setTarget(randomSquare(square))
    } else {
      errorsRef.current += 1
      setErrors(e => e + 1)
    }
  }, [phase, target])

  // Custom square styles
  const customSquareStyles: Record<string, React.CSSProperties> = {}
  if (flash) {
    customSquareStyles[flash.sq] = {
      backgroundColor: flash.correct ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
    }
  }

  return (
    <div className="min-h-screen bg-void text-bone flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-void-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/solo')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors">← Volver</button>
          <span className="font-mono text-sm text-bone-2">Visión · Coordenadas</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setFlipped(f => !f)}
            className="text-bone-3 font-mono text-xs hover:text-bone transition-colors px-3 py-1.5 border border-void-4 hover:border-bone-3 rounded-sm"
          >
            {flipped ? 'Negras' : 'Blancas'}
          </button>
          <button onClick={logout} className="text-bone-3 font-mono text-xs hover:text-red-400 transition-colors">Salir</button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">

        {/* Stats bar */}
        <div className="flex items-center gap-8 font-mono text-sm">
          <div className="text-center">
            <div className="text-bone-3 text-xs mb-1">Tiempo</div>
            <div className={`text-2xl font-bold ${timeLeft <= 10 && phase === 'playing' ? 'text-red-400' : 'text-bone'}`}>
              {timeLeft}s
            </div>
          </div>
          <div className="text-center">
            <div className="text-bone-3 text-xs mb-1">Correctas</div>
            <div className="text-2xl font-bold text-green-400">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-bone-3 text-xs mb-1">Errores</div>
            <div className="text-2xl font-bold text-red-400">{errors}</div>
          </div>
          {bestScore !== null && (
            <div className="text-center">
              <div className="text-bone-3 text-xs mb-1">Récord</div>
              <div className="text-2xl font-bold text-amber-400">{bestScore}</div>
            </div>
          )}
        </div>

        {/* Target square */}
        <div className="text-center">
          {phase === 'idle' && (
            <p className="text-bone-3 font-mono text-sm">Haz clic en la casilla indicada lo más rápido que puedas</p>
          )}
          {phase === 'playing' && (
            <div className="text-5xl font-bold font-mono tracking-widest text-amber-400 animate-pulse-amber">
              {target}
            </div>
          )}
          {phase === 'done' && (
            <div className="text-center space-y-1">
              <div className="text-bone-3 font-mono text-xs">Resultado</div>
              <div className="text-4xl font-bold text-amber-400">{score} correctas</div>
              <div className="text-bone-3 font-mono text-sm">{errors} errores · precisión {score + errors > 0 ? Math.round(score / (score + errors) * 100) : 0}%</div>
              {score >= (bestScore ?? 0) && score > 0 && (
                <div className="text-green-400 font-mono text-xs mt-1">¡Nuevo récord!</div>
              )}
            </div>
          )}
        </div>

        {/* Board */}
        <div style={{ width: boardSize, height: boardSize }}>
          <Chessboard
            id="vision-coords"
            boardWidth={boardSize}
            position="start"
            boardOrientation={flipped ? 'black' : 'white'}
            onSquareClick={handleSquareClick}
            customSquareStyles={customSquareStyles}
            arePiecesDraggable={false}
          />
        </div>

        {/* Action button */}
        {phase !== 'playing' && (
          <button
            onClick={startGame}
            className="px-8 py-3 bg-amber-500 hover:bg-amber-400 text-void font-mono font-bold text-sm transition-colors rounded-sm"
          >
            {phase === 'idle' ? 'Iniciar' : 'Reintentar'}
          </button>
        )}
      </div>
    </div>
  )
}
