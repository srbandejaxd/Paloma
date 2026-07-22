	import { useState, useEffect, useRef, useCallback } from 'react'
	import { Chess } from 'chess.js'
	import { useNavigate, useLocation } from 'react-router-dom'
	import { useAuth } from '../lib/auth'
	import {
	  fetchMacrocycles, createMacrocycle, fetchMacrocycle,
	  fetchCycle, fetchReview, startReviewSession,
	  fetchSessionPuzzle, submitSessionPuzzle, endReviewSession,
	  Macrocycle, Cycle, Review, ReviewSession, ReviewConfig,
	  CyclePuzzle, updateMacrocycleConfig
	} from '../lib/api'
	import PuzzleBoard from '../components/Board/PuzzleBoard'
	
	const NAV_ITEMS = [
	  { path: '/solo', label: 'Home', icon: '🏠' },
	  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
	  { path: '/vision', label: 'Visión', icon: '👁' },
	  { path: '/history', label: 'Historial', icon: '📋' },
	  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
	  { path: '/blind', label: 'Ciego', icon: '🎲' },
	  { path: '/cycles', label: 'Ciclos', icon: '🔄' },
	]
	
	const CATEGORIES = [
	  { id: 'palomita', label: 'Woodpecker Method' },
	  { id: 'woodpecker_method2', label: 'Woodpecker Method 2' },
	]
	
	const DEFAULT_REVIEW_CONFIG = [
	  { review_number: 1, days_work: 7, days_rest: 3 },
	  { review_number: 2, days_work: 5, days_rest: 2 },
	  { review_number: 3, days_work: 3, days_rest: 1 },
	  { review_number: 4, days_work: 1, days_rest: 0 },
	]
	
	const SUBCATEGORY_LABELS: Record<string, { label: string; color: string }> = {
	  'Easy Exercises':              { label: 'Fácil',        color: '#27ae60' },
	  'Intermediate Exercises 1':    { label: 'Intermedio I',  color: '#f39c12' },
	  'Intermediate Exercises 2':    { label: 'Intermedio II', color: '#e67e22' },
	  'Advanced Exercises':          { label: 'Avanzado',      color: '#e74c3c' },
	  'Ejercicios de Educacion Publica': { label: 'Educación Pública', color: '#27ae60' },
	  'Ejercicios de Examen':        { label: 'Examen',        color: '#f39c12' },
	  'Ejercicios de Nivel Academico': { label: 'Nivel Académico', color: '#e67e22' },
	  'Ejercicios de Dificultad Media': { label: 'Dificultad Media', color: '#e74c3c' },
	  'Ejercicios de Dificultad Dificil': { label: 'Difícil',   color: '#8e44ad' },
	  'Ejercicios de Dificultad Experta': { label: 'Experto',   color: '#2c3e50' },
	}
	
	const errorSound = new Audio('/sounds/error.mp3')
	errorSound.preload = 'auto'
	const correctSound = new Audio('/sounds/correct.mp3')
	correctSound.preload = 'auto'
	
	type Screen = 'intro' | 'list' | 'macrocycle' | 'cycle' | 'review' | 'session' | 'create'
	
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
	
	function formatHMS(ms: number): string {
	  const s = Math.max(0, Math.floor(ms / 1000))
	  const h = Math.floor(s / 3600)
	  const m = Math.floor((s % 3600) / 60)
	  const sec = s % 60
	  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
	  return `${m}:${String(sec).padStart(2, '0')}`
	}
	
	function formatDate(iso: string): string {
	  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
	}
	
	function timeUntil(iso: string): string {
	  const diff = new Date(iso).getTime() - Date.now()
	  if (diff <= 0) return 'Disponible ahora'
	  const h = Math.floor(diff / 3600000)
	  const m = Math.floor((diff % 3600000) / 60000)
	  return `${h}h ${m}m`
	}
	
	export default function Cycles() {
	  const { user, logout } = useAuth()
	  const navigate = useNavigate()
	  const location = useLocation()
	  const [dark, setDark] = useState(true)
	  const [screen, setScreen] = useState<Screen>('intro')
	
	  // Data states
	  const [macrocycles, setMacrocycles] = useState<Macrocycle[]>([])
	  const [activeMacrocycle, setActiveMacrocycle] = useState<Macrocycle | null>(null)
	  const [activeCycle, setActiveCycle] = useState<(Cycle & { reviews: Review[]; category: string; hoursPerDay: number }) | null>(null)
	  const [activeReview, setActiveReview] = useState<(Review & { sessions: ReviewSession[]; category: string; hoursPerDay: number; cycleStart: number }) | null>(null)
	
	  // Session state
	  const [sessionId, setSessionId] = useState<number | null>(null)
	  const [currentPuzzle, setCurrentPuzzle] = useState<CyclePuzzle | null>(null)
	  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
	  const [sessionLimitMs, setSessionLimitMs] = useState<number>(0)
	  const [elapsed, setElapsed] = useState(0)
	  const [puzzleIndex, setPuzzleIndex] = useState(0)
	  const [solutionStep, setSolutionStep] = useState(0)
	  const [puzzleAttempts, setPuzzleAttempts] = useState(0)
	  const [hintUsed, setHintUsed] = useState(false)
	  const [hintSquare, setHintSquare] = useState<string | null>(null)
	  const [sessionSolved, setSessionSolved] = useState(0)
	  const [timeUp, setTimeUp] = useState(false)
	  const [sessionResult, setSessionResult] = useState<{ reviewComplete?: boolean; cycleComplete?: boolean; macrocycleComplete?: boolean; restDays?: number } | null>(null)
	
	  // Create modal state
	  const [createCategory, setCreateCategory] = useState<string>('palomita')
	  const [createHours, setCreateHours] = useState<number>(2)
	  const [createConfig, setCreateConfig] = useState(DEFAULT_REVIEW_CONFIG)
	  const [creating, setCreating] = useState(false)
	  const [createError, setCreateError] = useState<string | null>(null)
	
	  const [loading, setLoading] = useState(false)
	  const [sessionError, setSessionError] = useState<string | null>(null)
	  const [availableAt, setAvailableAt] = useState<string | null>(null)
	
	  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
	  const puzzleStartRef = useRef<number>(Date.now())
	
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
	  }, [user, navigate])
	
	  // Cronómetro de sesión
	  useEffect(() => {
	    if (screen !== 'session' || !sessionStartedAt || timeUp) return
	    timerRef.current = setInterval(() => {
	      const e = Date.now() - sessionStartedAt
	      setElapsed(e)
	      if (e >= sessionLimitMs) {
	        setTimeUp(true)
	        clearInterval(timerRef.current!)
	      }
	    }, 500)
	    return () => clearInterval(timerRef.current!)
	  }, [screen, sessionStartedAt, sessionLimitMs, timeUp])
	
	  // Cargar macrociclos
	  async function loadMacrocycles() {
	    setLoading(true)
	    try {
	      const data = await fetchMacrocycles()
	      setMacrocycles(data)
	    } catch (e) { console.error(e) }
	    finally { setLoading(false) }
	  }
	
	  async function goToList() {
	    await loadMacrocycles()
	    setScreen('list')
	  }
	
	  async function goToMacrocycle(id: number) {
	    setLoading(true)
	    try {
	      const data = await fetchMacrocycle(id)
	      setActiveMacrocycle(data)
	      setScreen('macrocycle')
	    } catch (e) { console.error(e) }
	    finally { setLoading(false) }
	  }
	
	  async function goToCycle(id: number) {
	    setLoading(true)
	    try {
	      const data = await fetchCycle(id)
	      setActiveCycle(data)
	      setScreen('cycle')
	    } catch (e) { console.error(e) }
	    finally { setLoading(false) }
	  }
	
	  async function goToReview(id: number) {
	    setLoading(true)
	    try {
	      const data = await fetchReview(id)
	      setActiveReview(data)
	      setSessionError(null)
	      setAvailableAt(null)
	      setScreen('review')
	    } catch (e) { console.error(e) }
	    finally { setLoading(false) }
	  }
	
	  async function handleStartSession(reviewId: number) {
	    setLoading(true)
	    setSessionError(null)
	    try {
	      const data = await startReviewSession(reviewId)
	      setSessionId(data.sessionId)
	      setCurrentPuzzle(data.puzzle)
	      setPuzzleIndex(data.puzzleIndex)
	      setSessionStartedAt(Date.now())
	      setSessionLimitMs(data.hoursPerDay * 3600 * 1000)
	      setElapsed(0)
	      setSessionSolved(0)
	      setPuzzleAttempts(0)
	      setHintUsed(false)
	      setHintSquare(null)
	      setTimeUp(false)
	      setSessionResult(null)
	      puzzleStartRef.current = Date.now()
	      setScreen('session')
	    } catch (e: unknown) {
	      const err = e as Error
	      if (err.message?.includes('disponible')) {
	        // Extraer availableAt del servidor
	        setSessionError(err.message)
	      } else {
	        setSessionError(err.message || 'Error al iniciar sesión')
	      }
	    } finally { setLoading(false) }
	  }
	
	  const handlePuzzleSolved = useCallback(async (_timeMs: number, errors: number) => {
	    if (!sessionId || !currentPuzzle) return
	    const timeMs = Date.now() - puzzleStartRef.current
	
	    try {
	      const result = await submitSessionPuzzle(sessionId, {
	        puzzleId: currentPuzzle.id,
	        attempts: puzzleAttempts + 1,
	        hintUsed,
	        timeMs,
	      })
	
	      correctSound.currentTime = 0
	      correctSound.play().catch(() => {})
	      setSessionSolved(s => s + 1)
	      setPuzzleAttempts(0)
	      setSolutionStep(0)
	      setHintUsed(false)
	      setHintSquare(null)
	
	      if (result.sessionComplete) {
	        // Tiempo agotado o pool terminado — cerrar sesión
	        const endResult = await endReviewSession(sessionId)
	        setSessionResult(endResult)
	        setTimeUp(true)
	      } else if (result.nextPuzzle) {
	        setCurrentPuzzle(result.nextPuzzle)
	        setPuzzleIndex(p => p + 1)
	        puzzleStartRef.current = Date.now()
	        if (result.elapsedMs !== undefined) setElapsed(result.elapsedMs)
	      }
	    } catch (e) { console.error(e) }
	  }, [sessionId, currentPuzzle, puzzleAttempts, hintUsed])
	
	  const handlePuzzleError = useCallback(() => {
	    errorSound.currentTime = 0
	    errorSound.play().catch(() => {})
	    setPuzzleAttempts(p => p + 1)
	  }, [])
	
	  function handleHint() {
	  if (!currentPuzzle) return
	  setHintUsed(true)
	  try {
	    const game = new Chess()
	    game.load(currentPuzzle.fen)
	    // Reproducir todos los movimientos hasta el turno actual
	    for (let i = 0; i < solutionStep; i++) {
	      game.move(currentPuzzle.solution[i])
	    }
	    const move = game.move(currentPuzzle.solution[solutionStep])
	    setHintSquare(move ? move.from : null)
	  } catch { setHintSquare(null) }
	}
	
	  async function handleTimeUpConfirm() {
	    if (!sessionId) return
	    setLoading(true)
	    try {
	      const result = await endReviewSession(sessionId)
	      setSessionResult(result)
	    } catch (e) { console.error(e) }
	    finally { setLoading(false) }
	  }
	
	  async function handleCreateMacrocycle() {
	    setCreating(true)
	    setCreateError(null)
	    try {
	      await createMacrocycle({
	        category: createCategory,
	        hoursPerDay: createHours,
	        reviewConfig: createConfig,
	      })
	      await goToList()
	    } catch (e: unknown) {
	      const err = e as Error
	      setCreateError(err.message || 'Error al crear')
	    } finally { setCreating(false) }
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
	                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} style={{ backgroundColor: accentColor }} />
	                  </button>
	                  {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
	                </div>
	              )
	            })}
	          </div>
	        </div>
	      </nav>
	    )
	  }
	
	  function StatusBadge({ status }: { status: string }) {
	    const colors: Record<string, string> = {
	      active: 'bg-green-500 bg-opacity-20 text-green-400',
	      completed: 'bg-blue-500 bg-opacity-20 text-blue-400',
	      failed: 'bg-red-500 bg-opacity-20 text-red-400',
	    }
	    const labels: Record<string, string> = { active: 'Activo', completed: 'Completado', failed: 'Cancelado' }
	    return (
	      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${colors[status] || ''}`}>
	        {labels[status] || status}
	      </span>
	    )
	  }
	
	  // ── INTRO ─────────────────────────────────────────────────────────────────
	  if (screen === 'intro') {
	    return (
	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
	        <Nav />
	        <div className="max-w-3xl mx-auto px-6 py-20">
	          <div className="mb-12">
	            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Método Woodpecker</p>
	            <h2 className={`text-5xl font-bold ${t.text} leading-none mb-6`} style={{ letterSpacing: '-0.02em' }}>
	              Ciclos 🔄
	            </h2>
	            <p className={`text-lg ${t.text2} leading-relaxed max-w-xl`}>
	              El núcleo del método Woodpecker: resuelve cientos de puzzles en secuencia, repite el mismo bloque varias veces y mide tu mejora real ciclo a ciclo.
	            </p>
	          </div>
	
	          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-6`}>
	            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-6`}>Cómo funciona</p>
	            <div className="space-y-6">
	              {[
	                { icon: '🔄', title: 'Macrociclo', desc: 'Un macrociclo es el intento completo de pasar por todos los ejercicios de una categoría. Puedes tener uno activo por categoría.' },
	                { icon: '📦', title: 'Ciclo', desc: 'Cada ciclo cubre un tramo del pool de ejercicios. El siguiente ciclo arranca donde el anterior terminó.' },
	                { icon: '📋', title: 'Repaso', desc: 'Dentro de cada ciclo hay varios repasos. Cada repaso recorre el mismo tramo desde el principio. El objetivo es hacerlo más rápido cada vez.' },
	                { icon: '⏱️', title: 'Sesión diaria', desc: 'Cada repaso tiene N días de trabajo con horas fijas. Tienes un día de gracia: si saltas 2 días seguidos el repaso se cancela.' },
	                { icon: '💡', title: 'Pista', desc: 'Puedes pedir una pista en cualquier momento — se iluminará la pieza que debes mover. Sin costo en tus métricas.' },
	                { icon: '✅', title: 'Sin saltar', desc: 'No avanzas hasta resolver el puzzle correctamente. El cronómetro sigue corriendo aunque estés atascado.' },
	              ].map(step => (
	                <div key={step.title} className="flex gap-4">
	                  <div className="text-2xl flex-shrink-0 mt-0.5">{step.icon}</div>
	                  <div>
	                    <p className={`font-bold ${t.text} mb-1`}>{step.title}</p>
	                    <p className={`text-sm ${t.text2} leading-relaxed`}>{step.desc}</p>
	                  </div>
	                </div>
	              ))}
	            </div>
	          </div>
	
	          <div className={`rounded-xl ${t.bg3} ${t.border} border px-6 py-4 mb-10`}>
	            <p className={`text-xs ${t.text3} leading-relaxed`}>
	              💡 Por defecto los repasos siguen la progresión del libro: 7 días → 5 días → 3 días → 1 día, con días de descanso entre cada uno. Puedes personalizar esta configuración al crear un macrociclo.
	            </p>
	          </div>
	
	          <button
	            onClick={goToList}
	            className="px-10 py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:shadow-lg hover:scale-105"
	            style={{ backgroundColor: accentColor }}
	          >
	            Ver mis macrociclos
	          </button>
	        </div>
	        <div className={`${t.bg2} ${t.border} border-t mt-16`}>
	          <div className="max-w-7xl mx-auto px-6 py-6 flex justify-end">
	            <button onClick={logout} className={`px-5 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-medium ${t.text3} hover:${t.text} transition-all`}>Cerrar sesión</button>
	          </div>
	        </div>
	      </div>
	    )
	  }
	
	  // ── CREAR MACROCICLO ──────────────────────────────────────────────────────
	  if (screen === 'create') {
	    return (
	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
	        <Nav />
	        <div className="max-w-2xl mx-auto px-6 py-16">
	          <button onClick={() => setScreen('list')} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
	            Volver
	          </button>
	
	          <div className="mb-10">
	            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Nuevo</p>
	            <h2 className={`text-4xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>Crear macrociclo</h2>
	          </div>
	
	          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 space-y-8`}>
	            {/* Categoría */}
	            <div>
	              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Categoría</label>
	              <select
	                value={createCategory}
	                onChange={e => setCreateCategory(e.target.value)}
	                className={`w-full px-4 py-3 rounded-lg border focus:outline-none font-semibold ${t.inputBg} ${t.border}`}
	              >
	                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
	              </select>
	            </div>
	
	            {/* Horas por día */}
	            <div>
	              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Horas de trabajo por día</label>
	              <div className="flex items-center gap-4">
	                <input
	                  type="number"
	                  min={0.5} max={8} step={0.5}
	                  value={createHours}
	                  onChange={e => setCreateHours(Number(e.target.value))}
	                  className={`w-28 px-4 py-3 rounded-lg border focus:outline-none font-semibold text-center ${t.inputBg} ${t.border}`}
	                />
	                <p className={`text-sm ${t.text3}`}>{createHours}h por sesión</p>
	              </div>
	            </div>
	
	            {/* Config de repasos */}
	            <div>
	              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Configuración de repasos</label>
	              <div className="space-y-3">
	                {createConfig.map((rc, idx) => (
	                  <div key={idx} className={`flex items-center gap-4 p-4 rounded-lg ${t.bg3}`}>
	                    <span className={`text-sm font-bold w-20 ${t.text3}`}>Repaso {rc.review_number}</span>
	                    <div className="flex items-center gap-2 flex-1">
	                      <input
	                        type="number" min={1} max={30}
	                        value={rc.days_work}
	                        onChange={e => {
	                          const next = [...createConfig]
	                          next[idx] = { ...next[idx], days_work: Number(e.target.value) }
	                          setCreateConfig(next)
	                        }}
	                        className={`w-16 px-2 py-1.5 rounded-lg border text-center text-sm font-semibold ${t.inputBg} ${t.border}`}
	                      />
	                      <span className={`text-xs ${t.text3}`}>días trabajo</span>
	                    </div>
	                    <div className="flex items-center gap-2 flex-1">
	                      <input
	                        type="number" min={0} max={14}
	                        value={rc.days_rest}
	                        onChange={e => {
	                          const next = [...createConfig]
	                          next[idx] = { ...next[idx], days_rest: Number(e.target.value) }
	                          setCreateConfig(next)
	                        }}
	                        className={`w-16 px-2 py-1.5 rounded-lg border text-center text-sm font-semibold ${t.inputBg} ${t.border}`}
	                      />
	                      <span className={`text-xs ${t.text3}`}>días descanso</span>
	                    </div>
	                  </div>
	                ))}
	              </div>
	            </div>
	
	            {createError && (
	              <div className="px-4 py-3 rounded-lg border text-sm font-semibold" style={{ backgroundColor: 'rgba(231,76,60,0.08)', borderColor: 'rgba(231,76,60,0.3)', color: '#E74C3C' }}>
	                {createError}
	              </div>
	            )}
	
	            <button
	              onClick={handleCreateMacrocycle}
	              disabled={creating}
	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 disabled:opacity-50"
	              style={{ backgroundColor: accentColor }}
	            >
	              {creating ? 'Creando...' : 'Crear macrociclo'}
	            </button>
	          </div>
	        </div>
	      </div>
	    )
	  }
	
	  // ── LISTA DE MACROCICLOS ──────────────────────────────────────────────────
	  if (screen === 'list') {
	    return (
	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
	        <Nav />
	        <div className="max-w-4xl mx-auto px-6 py-16">
	          <div className="flex items-end justify-between mb-12">
	            <div>
	              <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Método Woodpecker</p>
	              <h2 className={`text-5xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>Mis macrociclos</h2>
	            </div>
	            <button
	              onClick={() => setScreen('create')}
	              className="px-6 py-3 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:scale-105"
	              style={{ backgroundColor: accentColor }}
	            >
	              + Nuevo
	            </button>
	          </div>
	
	          {loading ? (
	            <p className={`text-center py-20 ${t.text3}`}>Cargando...</p>
	          ) : macrocycles.length === 0 ? (
	            <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
	              <p className="text-4xl mb-4">🔄</p>
	              <p className={`text-lg ${t.text2} mb-2`}>No tienes macrociclos aún</p>
	              <p className={`text-sm ${t.text3}`}>Crea uno para empezar tu método Woodpecker</p>
	            </div>
	          ) : (
	            <div className="space-y-4">
	              {macrocycles.map(m => {
	                const catLabel = CATEGORIES.find(c => c.id === m.category)?.label || m.category
	                return (
	                  <button
	                    key={m.id}
	                    onClick={() => goToMacrocycle(m.id)}
	                    className={`w-full text-left rounded-xl ${t.bg2} ${t.border} border p-6 transition-all hover:shadow-lg hover:-translate-y-0.5`}
	                  >
	                    <div className="flex items-center justify-between">
	                      <div>
	                        <div className="flex items-center gap-3 mb-2">
	                          <h3 className={`text-lg font-bold ${t.text}`}>{catLabel}</h3>
	                          <StatusBadge status={m.status} />
	                        </div>
	                        <p className={`text-sm ${t.text3}`}>Iniciado {formatDate(m.createdAt)} · {m.hoursPerDay}h/día · Ejercicio {m.globalPuzzlePointer} alcanzado</p>
	                      </div>
	                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
	                        <polyline points="9 18 15 12 9 6"/>
	                      </svg>
	                    </div>
	                  </button>
	                )
	              })}
	            </div>
	          )}
	        </div>
	      </div>
	    )
	  }
	
	  // ── DETALLE DE MACROCICLO ─────────────────────────────────────────────────
	  if (screen === 'macrocycle' && activeMacrocycle) {
	    const catLabel = CATEGORIES.find(c => c.id === activeMacrocycle.category)?.label || activeMacrocycle.category
	    return (
	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
	        <Nav />
	        <div className="max-w-4xl mx-auto px-6 py-16">
	          <button onClick={goToList} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
	            Mis macrociclos
	          </button>
	
	          <div className="mb-12">
	            <div className="flex items-center gap-3 mb-2">
	              <p className={`text-sm uppercase tracking-[0.15em] ${t.text3}`}>{catLabel}</p>
	              <StatusBadge status={activeMacrocycle.status} />
	            </div>
	            <h2 className={`text-4xl font-bold ${t.text} leading-none mb-4`} style={{ letterSpacing: '-0.02em' }}>
	              Macrociclo
	            </h2>
	            <div className={`flex gap-6 text-sm ${t.text3}`}>
	              <span>🕐 {activeMacrocycle.hoursPerDay}h por sesión</span>
	              <span>📍 Ejercicio {activeMacrocycle.globalPuzzlePointer} alcanzado</span>
	              <span>📅 Iniciado {formatDate(activeMacrocycle.createdAt)}</span>
	            </div>
	          </div>
	
	          <div className="mb-6">
	            <h3 className={`text-xl font-bold ${t.text} mb-4`}>Ciclos</h3>
	            {!activeMacrocycle.cycles || activeMacrocycle.cycles.length === 0 ? (
	              <p className={`text-sm ${t.text3}`}>No hay ciclos aún</p>
	            ) : (
	              <div className="space-y-3">
	                {activeMacrocycle.cycles.map(c => (
	                  <button
	                    key={c.id}
	                    onClick={() => goToCycle(c.id)}
	                    className={`w-full text-left rounded-xl ${t.bg2} ${t.border} border p-5 transition-all hover:shadow-lg hover:-translate-y-0.5`}
	                  >
	                    <div className="flex items-center justify-between">
	                      <div>
	                        <div className="flex items-center gap-3 mb-1">
	                          <h4 className={`font-bold ${t.text}`}>Ciclo {c.cycleNumber}</h4>
	                          <StatusBadge status={c.status} />
	                        </div>
	                        <p className={`text-sm ${t.text3}`}>
	                          Ejercicios {c.puzzleStart + 1}–{c.puzzleEnd ? c.puzzleEnd : '?'} · Iniciado {formatDate(c.createdAt)}
	                        </p>
	                      </div>
	                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
	                        <polyline points="9 18 15 12 9 6"/>
	                      </svg>
	                    </div>
	                  </button>
	                ))}
	              </div>
	            )}
	          </div>
	        </div>
	      </div>
	    )
	  }
	
	  // ── DETALLE DE CICLO ──────────────────────────────────────────────────────
	  if (screen === 'cycle' && activeCycle) {
	    return (
	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
	        <Nav />
	        <div className="max-w-4xl mx-auto px-6 py-16">
	          <button onClick={() => activeMacrocycle && goToMacrocycle(activeMacrocycle.id)} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
	            Macrociclo
	          </button>
	
	          <div className="mb-12">
	            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-2`}>Ciclo {activeCycle.cycleNumber}</p>
	            <h2 className={`text-4xl font-bold ${t.text} leading-none mb-4`} style={{ letterSpacing: '-0.02em' }}>
	              Ejercicios {activeCycle.puzzleStart + 1}–{activeCycle.puzzleEnd ?? '?'}
	            </h2>
	            <StatusBadge status={activeCycle.status} />
	          </div>
	
	          <h3 className={`text-xl font-bold ${t.text} mb-4`}>Repasos</h3>
	          <div className="space-y-3">
	            {activeCycle.reviews?.map(r => {
	              const sessionsCount = r.sessions?.length || 0
	              return (
	                <button
	                  key={r.id}
	                  onClick={() => goToReview(r.id)}
	                  className={`w-full text-left rounded-xl ${t.bg2} ${t.border} border p-5 transition-all hover:shadow-lg hover:-translate-y-0.5`}
	                >
	                  <div className="flex items-center justify-between">
	                    <div>
	                      <div className="flex items-center gap-3 mb-1">
	                        <h4 className={`font-bold ${t.text}`}>Repaso {r.reviewNumber}</h4>
	                        <StatusBadge status={r.status} />
	                      </div>
	                      <p className={`text-sm ${t.text3}`}>
	                        {sessionsCount}/{r.daysWork} días · {r.daysRest} días descanso después
	                      </p>
	                    </div>
	                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
	                      <polyline points="9 18 15 12 9 6"/>
	                    </svg>
	                  </div>
	                </button>
	              )
	            })}
	          </div>
	        </div>
	      </div>
	    )
	  }
	
	  // ── DETALLE DE REPASO ─────────────────────────────────────────────────────
	  if (screen === 'review' && activeReview) {
	    const sessionsDone = activeReview.sessions?.filter(s => s.status === 'completed').length || 0
	    const lastSession = activeReview.sessions?.filter(s => s.status === 'completed').sort((a, b) => b.dayNumber - a.dayNumber)[0]
	    const nextAvailable = lastSession
	        ? new Date(new Date(lastSession.startedAt.endsWith('Z') ? lastSession.startedAt : lastSession.startedAt + 'Z').getTime() + 24 * 3600 * 1000).toISOString()
	        : null
	    const canStart = activeReview.status === 'active' && sessionsDone < activeReview.daysWork && (!nextAvailable || new Date() >= new Date(nextAvailable))
	
	    return (
	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
	        <Nav />
	        <div className="max-w-3xl mx-auto px-6 py-16">
	          <button onClick={() => activeCycle && goToCycle(activeCycle.id)} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
	            Ciclo
	          </button>
	
	          <div className="mb-10">
	            <div className="flex items-center gap-3 mb-2">
	              <p className={`text-sm uppercase tracking-[0.15em] ${t.text3}`}>Repaso {activeReview.reviewNumber}</p>
	              <StatusBadge status={activeReview.status} />
	            </div>
	            <h2 className={`text-4xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>
	              Día {sessionsDone + 1} de {activeReview.daysWork}
	            </h2>
	          </div>
	
	          {/* Progreso de días */}
	          <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 mb-6`}>
	            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Progreso del repaso</p>
	            <div className="flex gap-2 mb-4">
	              {Array.from({ length: activeReview.daysWork }).map((_, i) => (
	                <div
	                  key={i}
	                  className="flex-1 h-3 rounded-full"
	                  style={{ backgroundColor: i < sessionsDone ? accentColor : (dark ? '#1F1F2E' : '#E5DFD5') }}
	                />
	              ))}
	            </div>
	            <p className={`text-sm ${t.text2}`}>{sessionsDone} de {activeReview.daysWork} días completados</p>
	          </div>
	
	          {/* Disponibilidad */}
	          {nextAvailable && new Date() < new Date(nextAvailable) && (
	            <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 mb-6`}>
	              <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-2`}>Próxima sesión</p>
	              <p className={`text-2xl font-bold`} style={{ color: accentColor }}>{timeUntil(nextAvailable)}</p>
	              <p className={`text-xs ${t.text3} mt-1`}>Disponible a las {new Date(nextAvailable).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
	            </div>
	          )}
	
	          {sessionError && (
	            <div className="px-4 py-3 rounded-lg border text-sm font-semibold mb-4" style={{ backgroundColor: 'rgba(231,76,60,0.08)', borderColor: 'rgba(231,76,60,0.3)', color: '#E74C3C' }}>
	              {sessionError}
	            </div>
	          )}
	
	          {canStart && (
	            <button
	              onClick={() => handleStartSession(activeReview.id)}
	              disabled={loading}
	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:scale-105 disabled:opacity-50"
	              style={{ backgroundColor: accentColor }}
	            >
	              {loading ? 'Iniciando...' : `Iniciar día ${sessionsDone + 1}`}
	            </button>
	          )}
	
	          {activeReview.status === 'failed' && (
	            <button
	              onClick={() => handleStartSession(activeReview.id)}
	              disabled={loading}
	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 disabled:opacity-50"
	              style={{ backgroundColor: '#E74C3C' }}
	            >
	              {loading ? 'Reiniciando...' : 'Reiniciar repaso'}
	            </button>
	          )}
	
	          {/* Historial de sesiones */}
	          {activeReview.sessions && activeReview.sessions.length > 0 && (
	            <div className="mt-10">
	              <h3 className={`text-lg font-bold ${t.text} mb-4`}>Sesiones anteriores</h3>
	              <div className="space-y-3">
	                {activeReview.sessions.map(s => (
	                  <div key={s.id} className={`rounded-xl ${t.bg2} ${t.border} border p-4 flex items-center justify-between`}>
	                    <div>
	                      <p className={`font-bold ${t.text}`}>Día {s.dayNumber}</p>
	                      <p className={`text-xs ${t.text3}`}>{formatDate(s.startedAt)}</p>
	                    </div>
	                    <div className="flex items-center gap-6">
	                      <div className="text-right">
	                        <p className={`text-xs ${t.text3} mb-1`}>Puzzles</p>
	                        <p className={`font-bold ${t.text}`}>{s.puzzlesSolved}</p>
	                      </div>
	                      <StatusBadge status={s.status} />
	                    </div>
	                  </div>
	                ))}
	              </div>
	            </div>
	          )}
	        </div>
	      </div>
	    )
	  }
	
	  // ── SESIÓN ACTIVA ─────────────────────────────────────────────────────────
	  if (screen === 'session') {
	    const remaining = Math.max(0, sessionLimitMs - elapsed)
	    const progress = sessionLimitMs > 0 ? Math.min(1, elapsed / sessionLimitMs) : 0
	    const timerWarning = remaining < 5 * 60 * 1000 // últimos 5 minutos
	
	    // Pantalla de resultado al terminar
	    if (timeUp && sessionResult !== null) {
	      return (
	        <div className={`min-h-screen ${t.bg} flex items-center justify-center px-6 transition-colors duration-300`}>
	          <div className={`w-full max-w-md text-center rounded-2xl ${t.bg2} ${t.border} border p-10`}>
	            {sessionResult.macrocycleComplete ? (
	              <>
	                <div className="text-6xl mb-4">🏆</div>
	                <h2 className={`text-3xl font-bold mb-2`} style={{ color: accentColor }}>¡Macrociclo completo!</h2>
	                <p className={`text-sm ${t.text3} mb-8`}>Has completado todos los ejercicios. Puedes iniciar un nuevo macrociclo.</p>
	              </>
	            ) : sessionResult.cycleComplete ? (
	              <>
	                <div className="text-6xl mb-4">✨</div>
	                <h2 className={`text-3xl font-bold ${t.text} mb-2`}>¡Ciclo completado!</h2>
	                <p className={`text-sm ${t.text3} mb-8`}>El siguiente ciclo arrancará desde donde quedaste.</p>
	              </>
	            ) : sessionResult.reviewComplete ? (
	              <>
	                <div className="text-6xl mb-4">🎯</div>
	                <h2 className={`text-3xl font-bold ${t.text} mb-2`}>¡Repaso completado!</h2>
	                <p className={`text-sm ${t.text3} mb-8`}>{sessionResult.restDays ? `${sessionResult.restDays} días de descanso antes del próximo repaso.` : 'El siguiente repaso empieza desde el principio del tramo.'}</p>
	              </>
	            ) : (
	              <>
	                <div className="text-6xl mb-4">⏱️</div>
	                <h2 className={`text-3xl font-bold ${t.text} mb-2`}>Sesión completada</h2>
	                <p className={`text-sm ${t.text3} mb-2`}><span className="font-bold" style={{ color: accentColor }}>{sessionSolved}</span> puzzles resueltos hoy</p>
	                <p className={`text-sm ${t.text3} mb-8`}>Vuelve mañana para continuar desde donde quedaste.</p>
	              </>
	            )}
	            <button
	              onClick={() => { setScreen('review'); activeReview && goToReview(activeReview.id) }}
	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90"
	              style={{ backgroundColor: accentColor }}
	            >
	              Volver al repaso
	            </button>
	          </div>
	        </div>
	      )
	    }
	
	  // Tiempo agotado — cerrar sesión inmediatamente
	  if (timeUp && sessionResult === null) {
	  // Llamar endSession automáticamente si no se ha llamado aún
	  if (sessionId && !loading) {
	    handleTimeUpConfirm()
	  }
	  return (
	    <div className={`min-h-screen ${t.bg} flex items-center justify-center px-6 transition-colors duration-300`}>
	      <div className={`w-full max-w-md text-center rounded-2xl ${t.bg2} ${t.border} border p-10`}>
	        <div className="text-6xl mb-4">⏰</div>
	        <h2 className={`text-3xl font-bold ${t.text} mb-2`}>Tiempo agotado</h2>
	        <p className={`text-sm ${t.text3} mb-2`}>
	          <span className="font-bold" style={{ color: accentColor }}>{sessionSolved}</span> puzzles resueltos hoy
	        </p>
	        <p className={`text-sm ${t.text3}`}>Cerrando sesión...</p>
	      </div>
	    </div>
	  )
	}
	
	    const subcatInfo = currentPuzzle?.subcategory ? SUBCATEGORY_LABELS[currentPuzzle.subcategory] : null
	
	    return (
	      <div className={`min-h-screen ${t.bg} flex flex-col transition-colors duration-300`}>
	        {/* HUD */}
	        <div className={`${t.bg2} ${t.border} border-b sticky top-0 z-40 backdrop-blur-xl`}>
	          <div className="max-w-6xl mx-auto px-6 py-4">
	            <div className="flex items-center justify-between mb-3">
	              {/* Timer */}
	              <div>
	                <p className={`text-xs uppercase tracking-widest ${t.text3} mb-0.5`}>Tiempo restante</p>
	                <div
	                  className="text-3xl font-bold font-mono"
	                  style={{ color: timerWarning ? '#E74C3C' : accentColor, letterSpacing: '-0.02em' }}
	                >
	                  {formatHMS(remaining)}
	                </div>
	              </div>
	
	              {/* Puzzle counter + subcategory */}
	              <div className="text-center">
	                {subcatInfo && (
	                  <span
	                    className="text-xs px-3 py-1 rounded-full font-bold mb-1 inline-block"
	                    style={{ backgroundColor: `${subcatInfo.color}20`, color: subcatInfo.color }}
	                  >
	                    {subcatInfo.label}
	                  </span>
	                )}
	                <p className={`text-xs uppercase tracking-widest ${t.text3}`}>Puzzle</p>
	                <p className={`text-2xl font-bold ${t.text}`}>{sessionSolved + 1}</p>
	              </div>
	
	              {/* Acciones */}
	              <div className="flex items-center gap-3">
	                <button
	                  onClick={handleHint}
	                  className={`px-4 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-semibold transition-all hover:shadow-md`}
	                  style={{ color: hintUsed ? accentColor : undefined }}
	                  title="Ver pista"
	                >
	                  💡 Pista
	                </button>
	                <button onClick={toggleTheme} className={`flex items-center justify-center w-9 h-9 rounded-lg ${t.bg3} ${t.border} border ${t.text3}`}>
	                  {dark ? <SunIcon /> : <MoonIcon />}
	                </button>
	              </div>
	            </div>
	
	            {/* Barra de tiempo */}
	            <div className={`h-1 ${t.track} rounded-full overflow-hidden`}>
	              <div
	                className="h-full rounded-full transition-all duration-500"
	                style={{ width: `${(1 - progress) * 100}%`, backgroundColor: timerWarning ? '#E74C3C' : accentColor }}
	              />
	            </div>
	          </div>
	        </div>
	
	        {/* Board */}
	        <div className="flex-1 flex items-start justify-center pt-8 px-6">
	          <div className="w-full max-w-[520px]">
	            {currentPuzzle && (
	              <PuzzleBoard
	                key={currentPuzzle.id}
	                puzzle={currentPuzzle}
	                onSolved={handlePuzzleSolved}
	                onError={handlePuzzleError}
	                externalHighlights={hintSquare ? [hintSquare] : []}
	                autoSkipAfterErrors={0}
	              />
	            )}
	          </div>
	        </div>
	      </div>
	    )
	  }
	
	  return null
	}
