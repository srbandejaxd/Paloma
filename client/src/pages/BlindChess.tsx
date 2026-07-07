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
  let rank = 8, file = 0
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

type Phase = 'intro' | 'memorize' | 'input' | 'opponent' | 'correct' | 'wrong'

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

const NAV_ITEMS = [
  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
  { path: '/solo', label: 'Solo', icon: '🪃' },
  { path: '/vision', label: 'Visión', icon: '👁' },
  { path: '/history', label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
]

export default function BlindChess() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [puzzle, setPuzzle] = useState<BlindPuzzle | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<Phase>('intro')
  const [timeLeft, setTimeLeft] = useState(MEMORIZE_SECONDS)
  const [inputValue, setInputValue] = useState('')
  const [solutionIndex, setSolutionIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [opponentMove, setOpponentMove] = useState<string | null>(null)
  const [opponentTimeLeft, setOpponentTimeLeft] = useState(MEMORIZE_SECONDS)
  const [game, setGame] = useState<Chess | null>(null)
  const [dark, setDark] = useState(true)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('wp_theme')
    if (saved) setDark(saved === 'dark')
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('wp_theme', next ? 'dark' : 'light')
  }

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
    // Solo cargamos puzzle, no arrancamos todavía (la intro lo hará)
    fetchBlindPuzzle().then(p => {
      setPuzzle(p)
      const g = new Chess()
      g.load(p.fen)
      setGame(g)
      setLoading(false)
    }).catch(console.error)
  }, [user, navigate])

  // Timer memorización — solo corre en fase 'memorize'
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

  // Timer movimiento rival
  useEffect(() => {
    if (phase !== 'opponent') return
    setOpponentTimeLeft(MEMORIZE_SECONDS)
    timerRef.current = setInterval(() => {
      setOpponentTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          setOpponentMove(null)
          if (puzzle && solutionIndex + 2 < puzzle.solution.length) {
            setSolutionIndex(si => si + 2)
            setPhase('input')
            setTimeout(() => inputRef.current?.focus(), 100)
          } else {
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

    setGame(gameCopy)
    setInputValue('')
    setError(null)

    const rivalIndex = solutionIndex + 1
    if (rivalIndex < puzzle.solution.length) {
      const rivalSAN = puzzle.solution[rivalIndex]
      const gameWithRival = new Chess()
      gameWithRival.loadPgn(gameCopy.pgn())
      try { gameWithRival.move(rivalSAN) } catch { }
      setGame(gameWithRival)
      setOpponentMove(rivalSAN)
      setPhase('opponent')
    } else {
      handleAdvance()
    }
  }

  // THEME
  const t = dark ? {
    bg: 'bg-[#0A0A0F]', bg2: 'bg-[#12121A]', bg3: 'bg-[#1C1C28]',
    border: 'border-[#1F1F2E]', borderLight: 'border-[#2A2A3A]',
    text: 'text-[#E8E6E0]', text2: 'text-[#B8B5AC]', text3: 'text-[#7A776E]',
    accent: 'text-[#D4A017]', accentBg: 'bg-[#D4A017]',
    inputBg: 'bg-[#12121A] border-[#1F1F2E] text-[#E8E6E0]',
    track: 'bg-[#1F1F2E]',
  } : {
    bg: 'bg-[#FAFAF7]', bg2: 'bg-[#F3EFE7]', bg3: 'bg-[#EDE8DF]',
    border: 'border-[#E5DFD5]', borderLight: 'border-[#D9D2C8]',
    text: 'text-[#1A1814]', text2: 'text-[#4A4640]', text3: 'text-[#8A8478]',
    accent: 'text-[#A07810]', accentBg: 'bg-[#A07810]',
    inputBg: 'bg-[#F3EFE7] border-[#E5DFD5] text-[#1A1814]',
    track: 'bg-[#E5DFD5]',
  }
  const accentColor = dark ? '#D4A017' : '#A07810'

  // Navbar compartida
  function Nav() {
    return (
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user?.nickname}</h1>
            </div>
            <button onClick={toggleTheme} className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}>
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            <div className="flex items-center">
              <button
                onClick={() => setPhase('intro')}
                className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all ${t.text2} hover:${t.text} relative group`}
              >
                <span className="text-lg">🎲</span>
                <span className="whitespace-nowrap">Ciego</span>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 transition-all scale-x-0 group-hover:scale-x-100" style={{ backgroundColor: accentColor }} />
              </button>
              <div className={`w-px h-4 ${t.borderLight}`} />
            </div>
            {NAV_ITEMS.map((item, idx) => (
              <div key={item.path} className="flex items-center">
                <button onClick={() => navigate(item.path)} className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all ${t.text2} hover:${t.text} relative group`}>
                  <span className="text-lg">{item.icon}</span>
                  <span className="whitespace-nowrap">{item.label}</span>
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 transition-all scale-x-0 group-hover:scale-x-100" style={{ backgroundColor: accentColor }} />
                </button>
                {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
              </div>
            ))}
          </div>
        </div>
      </nav>
    )
  }

  // ── INTRO SCREEN ────────────────────────────────────────────────────────────
  if (phase === 'intro' || (loading && phase === 'intro')) {
    return (
      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
        <Nav />
        <div className="max-w-3xl mx-auto px-6 py-20">
          <div className="mb-12">
            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Modo entrenamiento</p>
            <h2 className={`text-5xl font-bold ${t.text} leading-none mb-6`} style={{ letterSpacing: '-0.02em' }}>
              Ajedrez Ciego 🎲
            </h2>
            <p className={`text-lg ${t.text2} leading-relaxed max-w-xl`}>
              Entrena tu visión del tablero resolviendo posiciones sin ver las piezas. Solo tienes la lista de piezas y sus coordenadas.
            </p>
          </div>

          {/* Cómo funciona */}
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-8`}>
            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-6`}>Cómo funciona</p>
            <div className="space-y-5">
              {[
                { n: '1', title: 'Memoriza la posición', desc: `Tienes ${MEMORIZE_SECONDS} segundos para recordar dónde está cada pieza. El tablero aparece vacío, solo ves coordenadas.` },
                { n: '2', title: 'Escribe tu movimiento', desc: 'Cuando el tiempo se acabe, escribe el mejor movimiento en notación algebraica estándar (ej. Dh5+, Nf3, O-O).' },
                { n: '3', title: 'Respuesta rival', desc: 'Si hay respuesta del rival, verás su movimiento durante unos segundos antes de continuar.' },
                { n: '4', title: 'Avanza', desc: 'Completa toda la secuencia para pasar al siguiente puzzle. Los puzzles se desbloquean en orden.' },
              ].map(step => (
                <div key={step.n} className="flex gap-4">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                  >
                    {step.n}
                  </div>
                  <div>
                    <p className={`font-bold ${t.text} mb-1`}>{step.title}</p>
                    <p className={`text-sm ${t.text2} leading-relaxed`}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notación soportada */}
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 mb-10`}>
            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Notación aceptada</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { es: 'D / Dama', en: '= Q (Reina)' },
                { es: 'T / Torre', en: '= R (Rook)' },
                { es: 'A / Alfil', en: '= B (Bishop)' },
                { es: 'C / Caballo', en: '= N (Knight)' },
                { es: 'R / Rey', en: '= K (King)' },
                { es: 'O-O / O-O-O', en: 'Enroque' },
              ].map(n => (
                <div key={n.es} className={`rounded-lg ${t.bg3} px-3 py-2`}>
                  <p className={`text-sm font-bold ${t.text}`}>{n.es}</p>
                  <p className={`text-xs ${t.text3}`}>{n.en}</p>
                </div>
              ))}
            </div>
          </div>

          {puzzle && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setPhase('memorize')
                  setTimeLeft(MEMORIZE_SECONDS)
                  setSolutionIndex(0)
                  setInputValue('')
                  setError(null)
                  setOpponentMove(null)
                }}
                className="px-10 py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:shadow-lg hover:scale-105"
                style={{ backgroundColor: accentColor }}
              >
                Comenzar
              </button>
              <div className={`text-sm ${t.text3}`}>
                Puzzle {puzzle.currentNumber} / {puzzle.total}
              </div>
            </div>
          )}
          {loading && <p className={`text-sm ${t.text3}`}>Cargando puzzle...</p>}
        </div>

        <div className={`${t.bg2} ${t.border} border-t mt-16`}>
          <div className="max-w-7xl mx-auto px-6 py-6 flex justify-end">
            <button onClick={logout} className={`px-5 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-medium ${t.text3} hover:${t.text} transition-all`}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── PUZZLE SCREEN ───────────────────────────────────────────────────────────
  if (!puzzle || !game) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
        <p className={`${t.text3} text-sm`}>Cargando puzzle...</p>
      </div>
    )
  }

  const pieces = parseFenToPieces(puzzle.fen)
  const playerColor = puzzle.fen.split(' ')[1] === 'w' ? 'Blancas' : 'Negras'
  const rivalColor = playerColor === 'Blancas' ? 'Negras' : 'Blancas'
  const activeTimer = phase === 'memorize' ? timeLeft : opponentTimeLeft
  const timerWarning = activeTimer <= 10

  return (
    <div className={`min-h-screen ${t.bg} flex flex-col transition-colors duration-300`}>
      <Nav />

      {/* Barra de progreso */}
      <div className={`h-1 ${t.track}`}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${(puzzle.currentNumber / puzzle.total) * 100}%`, backgroundColor: accentColor }}
        />
      </div>

      <div className="max-w-6xl mx-auto w-full px-6 py-10 flex flex-col lg:flex-row gap-10 items-start">

        {/* Tablero vacío — más grande */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0">
          <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>Tablero</p>
          <div className={`rounded-xl overflow-hidden border ${t.border}`} style={{ width: 480, height: 480 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', width: 480, height: 480 }}>
              {Array.from({ length: 64 }).map((_, i) => {
                const row = Math.floor(i / 8)
                const col = i % 8
                const isDark = (row + col) % 2 === 1
                return (
                  <div
                    key={i}
                    style={{
                      width: 60, height: 60,
                      backgroundColor: isDark ? '#b58863' : '#f0d9b5',
                    }}
                  />
                )
              })}
            </div>
          </div>
          <p className={`text-sm font-semibold ${t.text2}`}>Juegas con <span style={{ color: accentColor }}>{playerColor}</span></p>
          <p className={`text-xs ${t.text3}`}>Puzzle {puzzle.currentNumber} / {puzzle.total}</p>
        </div>

        {/* Panel lateral */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* Timer visible cuando corre */}
          {(phase === 'memorize' || phase === 'opponent') && (
            <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 flex items-center justify-between`}>
              <div>
                <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-1`}>
                  {phase === 'memorize' ? 'Tiempo para memorizar' : `Movimiento de ${rivalColor}`}
                </p>
                <p className={`text-sm ${t.text2}`}>
                  {phase === 'memorize' ? 'Recuerda las posiciones de las piezas' : 'Memoriza la respuesta rival'}
                </p>
              </div>
              <div
                className="text-5xl font-bold font-mono w-20 text-right"
                style={{ color: timerWarning ? '#E74C3C' : accentColor }}
              >
                {activeTimer}
              </div>
            </div>
          )}

          {/* Posiciones — solo visibles durante memorización */}
          {(phase === 'memorize' || phase === 'input' || phase === 'wrong') && (
            <div
              className={`rounded-xl ${t.bg2} ${t.border} border p-6 transition-opacity duration-500`}
              style={{ opacity: phase === 'memorize' ? 1 : 0, pointerEvents: phase === 'memorize' ? 'auto' : 'none' }}
            >
              <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Posición de las piezas</p>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold mb-2" style={{ color: accentColor }}>♔ Blancas</p>
                  <div className="flex flex-wrap gap-2">
                    {pieces.white.map((p, i) => (
                      <span key={i} className={`text-xs font-mono ${t.bg3} ${t.border} border px-2.5 py-1.5 rounded-lg ${t.text}`}>{p}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`text-xs font-bold ${t.text3} mb-2`}>♚ Negras</p>
                  <div className="flex flex-wrap gap-2">
                    {pieces.black.map((p, i) => (
                      <span key={i} className={`text-xs font-mono ${t.bg3} ${t.border} border px-2.5 py-1.5 rounded-lg ${t.text}`}>{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Movimiento rival */}
          {phase === 'opponent' && opponentMove && (
            <div className={`rounded-xl ${t.bg2} ${t.border} border p-6`}>
              <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Respuesta de {rivalColor}</p>
              <p className="text-5xl font-bold font-mono mb-3" style={{ color: accentColor }}>{opponentMove}</p>
              <p className={`text-sm ${t.text3}`}>Memoriza este movimiento antes de continuar...</p>
            </div>
          )}

          {/* Input de movimiento */}
          {(phase === 'input' || phase === 'wrong') && (
            <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 space-y-4`}>
              <div>
                <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-1`}>Tu movimiento</p>
                <p className={`text-sm ${t.text2}`}>{playerColor} — jugada {Math.floor(solutionIndex / 2) + 1}</p>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg border text-sm font-semibold"
                  style={{ backgroundColor: 'rgba(231,76,60,0.08)', borderColor: 'rgba(231,76,60,0.3)', color: '#E74C3C' }}>
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
                  className={`flex-1 px-4 py-3 rounded-xl border focus:outline-none font-mono text-sm transition-colors ${t.inputBg}`}
                  style={{ borderColor: dark ? '#1F1F2E' : '#E5DFD5' }}
                  disabled={phase === 'wrong'}
                  autoComplete="off"
                />
                <button
                  onClick={handleSubmit}
                  disabled={phase === 'wrong'}
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: accentColor }}
                >
                  OK
                </button>
              </div>
              <p className={`text-xs ${t.text3}`}>Notación algebraica estándar. Enter para confirmar.</p>
            </div>
          )}

          {/* Correcto */}
          {phase === 'correct' && (
            <div className={`rounded-xl ${t.bg2} border p-8 text-center`} style={{ borderColor: '#27ae60' }}>
              <div className="text-5xl mb-3">✅</div>
              <p className="text-lg font-bold text-green-400">¡Correcto!</p>
              <p className={`text-sm ${t.text3} mt-1`}>Cargando siguiente puzzle...</p>
            </div>
          )}

          {/* Info extra durante memorización */}
          {phase === 'memorize' && (
            <div className={`rounded-xl ${t.bg3} ${t.border} border px-5 py-4`}>
              <p className={`text-xs ${t.text3} leading-relaxed`}>
                💡 Cuando el tiempo termine deberás escribir el mejor movimiento en notación algebraica sin ver las piezas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
