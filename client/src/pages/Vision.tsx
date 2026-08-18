import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { useAuth } from '../lib/auth'
import { saveVisionSession } from '../lib/api'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8']
const DURATION = 30

function randomSquare(exclude?: string): string {
  let sq: string
  do { sq = FILES[Math.floor(Math.random() * 8)] + RANKS[Math.floor(Math.random() * 8)] }
  while (sq === exclude)
  return sq
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { path: '/home', label: 'Home', icon: '🏠' },
  { path: '/cycles', label: 'Ciclos', icon: '🕊️' },
  { path: '/solo', label: 'Solo', icon: '⚡' },
  { path: '/puzzles', label: 'Puzzles', icon: '📚' },
  { path: '/vision', label: 'Visión', icon: '👁' },
  { path: '/history', label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
  { path: '/blind', label: 'Ciego', icon: '🎲' },
  { path: '/openings', label: 'Aperturas', icon: '♟' },
]

type Phase = 'idle' | 'playing' | 'done'

export default function Vision() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [dark, setDark] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [target, setTarget] = useState('')
  const [score, setScore] = useState(0)
  const [errors, setErrors] = useState(0)
  const [timeLeft, setTimeLeft] = useState(DURATION)
  const [flash, setFlash] = useState<{ sq: string; correct: boolean } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [bestScore, setBestScore] = useState<number | null>(null)

  const scoreRef = useRef(0)
  const errorsRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const boardSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 340 : 560

  useEffect(() => {
    const saved = localStorage.getItem('wp_theme')
    if (saved) setDark(saved === 'dark')
    const stored = localStorage.getItem('vision_coords_best')
    if (stored) setBestScore(Number(stored))
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('wp_theme', next ? 'dark' : 'light')
  }

  const endGame = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('done')
    const finalScore = scoreRef.current
    const finalErrors = errorsRef.current
    const stored = localStorage.getItem('vision_coords_best')
    const prev = stored ? Number(stored) : 0
    if (finalScore > prev) {
      localStorage.setItem('vision_coords_best', String(finalScore))
      setBestScore(finalScore)
    }
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
        if (prev <= 1) { endGame(); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [endGame])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const handleSquareClick = useCallback((square: string) => {
    if (phase !== 'playing') return
    const correct = square === target
    setFlash({ sq: square, correct })
    setTimeout(() => setFlash(null), 250)
    if (correct) {
      scoreRef.current += 1
      setScore(s => s + 1)
      setTarget(randomSquare(square))
    } else {
      errorsRef.current += 1
      setErrors(e => e + 1)
    }
  }, [phase, target])

  const customSquareStyles: Record<string, React.CSSProperties> = {}
  if (flash) {
    customSquareStyles[flash.sq] = {
      backgroundColor: flash.correct ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
    }
  }

  const t = dark ? {
    bg: 'bg-[#0A0A0F]', bg2: 'bg-[#12121A]', bg3: 'bg-[#1C1C28]',
    border: 'border-[#252535]', borderLight: 'border-[#2A2A3A]', borderRaw: '#252535',
    text: 'text-[#E8E6E0]', text2: 'text-[#B8B5AC]', text3: 'text-[#7A776E]',
  } : {
    bg: 'bg-[#F5F0E8]', bg2: 'bg-[#EDE8DF]', bg3: 'bg-[#E2DBD0]',
    border: 'border-[#D4CABF]', borderLight: 'border-[#D9D2C8]', borderRaw: '#D4CABF',
    text: 'text-[#1A1814]', text2: 'text-[#4A4640]', text3: 'text-[#8A8478]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'
  const precision = score + errors > 0 ? Math.round(score / (score + errors) * 100) : 0

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300`}>

      {/* Nav */}
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user?.nickname}</h1>
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

      {/* Main */}
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col lg:flex-row gap-16 items-start">

        {/* Left — board + target */}
        <div className="flex-1 flex flex-col items-center gap-8">

          {/* Target */}
          <div className="h-20 flex items-center justify-center">
            {phase === 'idle' && (
              <p className={`text-sm ${t.text3} text-center max-w-xs leading-relaxed`}>
                Haz clic en la casilla indicada lo más rápido que puedas. 30 segundos.
              </p>
            )}
            {phase === 'playing' && (
              <div className="text-center">
                <p className={`text-xs uppercase tracking-widest ${t.text3} mb-2`}>Encuentra</p>
                <div className="text-6xl font-bold tracking-widest" style={{ color: accentColor, letterSpacing: '-0.01em' }}>
                  {target}
                </div>
              </div>
            )}
            {phase === 'done' && (
              <div className="text-center">
                <p className={`text-xs uppercase tracking-widest ${t.text3} mb-2`}>Resultado</p>
                <div className="text-5xl font-bold" style={{ color: accentColor }}>{score}</div>
                <p className={`text-sm ${t.text3} mt-1`}>correctas · {precision}% precisión</p>
                {score > 0 && score >= (bestScore ?? 0) && (
                  <p className="text-xs font-bold mt-2" style={{ color: '#27ae60' }}>¡Nuevo récord!</p>
                )}
              </div>
            )}
          </div>

          {/* Board */}
          <div className="rounded-xl overflow-hidden" style={{ width: boardSize, height: boardSize }}>
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

          {/* Button */}
          {phase !== 'playing' && (
            <button
              onClick={startGame}
              className="px-10 py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-black transition-all hover:opacity-90 hover:scale-105"
              style={{ backgroundColor: accentColor }}
            >
              {phase === 'idle' ? 'Iniciar →' : 'Reintentar →'}
            </button>
          )}
        </div>

        {/* Right — stats + controls */}
        <div className="lg:w-72 flex flex-col gap-6 lg:pt-4">

          {/* Stats */}
          <div className={`rounded-2xl ${t.bg2} border ${t.border} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${t.border}`}>
              <p className={`text-xs uppercase tracking-widest ${t.text3}`}>Marcadores</p>
            </div>
            {[
              { label: 'Tiempo',    value: `${timeLeft}s`, color: timeLeft <= 10 && phase === 'playing' ? '#E74C3C' : undefined },
              { label: 'Correctas', value: String(score),  color: '#27ae60' },
              { label: 'Errores',   value: String(errors), color: errors > 0 ? '#E74C3C' : undefined },
              ...(bestScore !== null ? [{ label: 'Récord', value: String(bestScore), color: accentColor }] : []),
            ].map((stat, i, arr) => (
              <div key={stat.label} className={`flex items-center justify-between px-6 py-4 ${i < arr.length - 1 ? `border-b ${t.border}` : ''}`}>
                <span className={`text-xs ${t.text3}`}>{stat.label}</span>
                <span className="text-lg font-bold font-mono" style={{ color: stat.color || (dark ? '#E8E6E0' : '#1A1814') }}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className={`rounded-2xl ${t.bg2} border ${t.border} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${t.border}`}>
              <p className={`text-xs uppercase tracking-widest ${t.text3}`}>Controles</p>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3">
              <button
                onClick={() => setFlipped(f => !f)}
                className={`w-full py-2.5 rounded-lg border ${t.border} text-xs font-semibold ${t.text2} transition-all hover:${t.text}`}
              >
                {flipped ? '♟ Vista negras' : '♙ Vista blancas'}
              </button>
              <button
                onClick={() => { logout(); navigate('/') }}
                className={`w-full py-2.5 rounded-lg border ${t.border} text-xs ${t.text3} transition-all hover:text-red-400`}
              >
                Cerrar sesión
              </button>
            </div>
          </div>


        </div>
      </div>
    </div>
  )
}
