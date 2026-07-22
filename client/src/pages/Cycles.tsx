     1	import { useState, useEffect, useRef, useCallback } from 'react'
     2	import { Chess } from 'chess.js'
     3	import { useNavigate, useLocation } from 'react-router-dom'
     4	import { useAuth } from '../lib/auth'
     5	import {
     6	  fetchMacrocycles, createMacrocycle, fetchMacrocycle,
     7	  fetchCycle, fetchReview, startReviewSession,
     8	  fetchSessionPuzzle, submitSessionPuzzle, endReviewSession,
     9	  Macrocycle, Cycle, Review, ReviewSession, ReviewConfig,
    10	  CyclePuzzle, updateMacrocycleConfig
    11	} from '../lib/api'
    12	import PuzzleBoard from '../components/Board/PuzzleBoard'
    13	
    14	const NAV_ITEMS = [
    15	  { path: '/solo', label: 'Home', icon: '🏠' },
    16	  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
    17	  { path: '/vision', label: 'Visión', icon: '👁' },
    18	  { path: '/history', label: 'Historial', icon: '📋' },
    19	  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
    20	  { path: '/blind', label: 'Ciego', icon: '🎲' },
    21	  { path: '/cycles', label: 'Ciclos', icon: '🔄' },
    22	]
    23	
    24	const CATEGORIES = [
    25	  { id: 'palomita', label: 'Woodpecker Method' },
    26	  { id: 'woodpecker_method2', label: 'Woodpecker Method 2' },
    27	]
    28	
    29	const DEFAULT_REVIEW_CONFIG = [
    30	  { review_number: 1, days_work: 7, days_rest: 3 },
    31	  { review_number: 2, days_work: 5, days_rest: 2 },
    32	  { review_number: 3, days_work: 3, days_rest: 1 },
    33	  { review_number: 4, days_work: 1, days_rest: 0 },
    34	]
    35	
    36	const SUBCATEGORY_LABELS: Record<string, { label: string; color: string }> = {
    37	  'Easy Exercises':              { label: 'Fácil',        color: '#27ae60' },
    38	  'Intermediate Exercises 1':    { label: 'Intermedio I',  color: '#f39c12' },
    39	  'Intermediate Exercises 2':    { label: 'Intermedio II', color: '#e67e22' },
    40	  'Advanced Exercises':          { label: 'Avanzado',      color: '#e74c3c' },
    41	  'Ejercicios de Educacion Publica': { label: 'Educación Pública', color: '#27ae60' },
    42	  'Ejercicios de Examen':        { label: 'Examen',        color: '#f39c12' },
    43	  'Ejercicios de Nivel Academico': { label: 'Nivel Académico', color: '#e67e22' },
    44	  'Ejercicios de Dificultad Media': { label: 'Dificultad Media', color: '#e74c3c' },
    45	  'Ejercicios de Dificultad Dificil': { label: 'Difícil',   color: '#8e44ad' },
    46	  'Ejercicios de Dificultad Experta': { label: 'Experto',   color: '#2c3e50' },
    47	}
    48	
    49	const errorSound = new Audio('/sounds/error.mp3')
    50	errorSound.preload = 'auto'
    51	const correctSound = new Audio('/sounds/correct.mp3')
    52	correctSound.preload = 'auto'
    53	
    54	type Screen = 'intro' | 'list' | 'macrocycle' | 'cycle' | 'review' | 'session' | 'create'
    55	
    56	function SunIcon() {
    57	  return (
    58	    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    59	      <circle cx="12" cy="12" r="5"/>
    60	      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    61	      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    62	      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    63	      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    64	    </svg>
    65	  )
    66	}
    67	
    68	function MoonIcon() {
    69	  return (
    70	    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    71	      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    72	    </svg>
    73	  )
    74	}
    75	
    76	function formatHMS(ms: number): string {
    77	  const s = Math.max(0, Math.floor(ms / 1000))
    78	  const h = Math.floor(s / 3600)
    79	  const m = Math.floor((s % 3600) / 60)
    80	  const sec = s % 60
    81	  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    82	  return `${m}:${String(sec).padStart(2, '0')}`
    83	}
    84	
    85	function formatDate(iso: string): string {
    86	  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    87	}
    88	
    89	function timeUntil(iso: string): string {
    90	  const diff = new Date(iso).getTime() - Date.now()
    91	  if (diff <= 0) return 'Disponible ahora'
    92	  const h = Math.floor(diff / 3600000)
    93	  const m = Math.floor((diff % 3600000) / 60000)
    94	  return `${h}h ${m}m`
    95	}
    96	
    97	export default function Cycles() {
    98	  const { user, logout } = useAuth()
    99	  const navigate = useNavigate()
   100	  const location = useLocation()
   101	  const [dark, setDark] = useState(true)
   102	  const [screen, setScreen] = useState<Screen>('intro')
   103	
   104	  // Data states
   105	  const [macrocycles, setMacrocycles] = useState<Macrocycle[]>([])
   106	  const [activeMacrocycle, setActiveMacrocycle] = useState<Macrocycle | null>(null)
   107	  const [activeCycle, setActiveCycle] = useState<(Cycle & { reviews: Review[]; category: string; hoursPerDay: number }) | null>(null)
   108	  const [activeReview, setActiveReview] = useState<(Review & { sessions: ReviewSession[]; category: string; hoursPerDay: number; cycleStart: number }) | null>(null)
   109	
   110	  // Session state
   111	  const [sessionId, setSessionId] = useState<number | null>(null)
   112	  const [currentPuzzle, setCurrentPuzzle] = useState<CyclePuzzle | null>(null)
   113	  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
   114	  const [sessionLimitMs, setSessionLimitMs] = useState<number>(0)
   115	  const [elapsed, setElapsed] = useState(0)
   116	  const [puzzleIndex, setPuzzleIndex] = useState(0)
   117	  const [solutionStep, setSolutionStep] = useState(0)
   118	  const [puzzleAttempts, setPuzzleAttempts] = useState(0)
   119	  const [hintUsed, setHintUsed] = useState(false)
   120	  const [hintSquare, setHintSquare] = useState<string | null>(null)
   121	  const [sessionSolved, setSessionSolved] = useState(0)
   122	  const [timeUp, setTimeUp] = useState(false)
   123	  const [sessionResult, setSessionResult] = useState<{ reviewComplete?: boolean; cycleComplete?: boolean; macrocycleComplete?: boolean; restDays?: number } | null>(null)
   124	
   125	  // Create modal state
   126	  const [createCategory, setCreateCategory] = useState<string>('palomita')
   127	  const [createHours, setCreateHours] = useState<number>(2)
   128	  const [createConfig, setCreateConfig] = useState(DEFAULT_REVIEW_CONFIG)
   129	  const [creating, setCreating] = useState(false)
   130	  const [createError, setCreateError] = useState<string | null>(null)
   131	
   132	  const [loading, setLoading] = useState(false)
   133	  const [sessionError, setSessionError] = useState<string | null>(null)
   134	  const [availableAt, setAvailableAt] = useState<string | null>(null)
   135	
   136	  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
   137	  const puzzleStartRef = useRef<number>(Date.now())
   138	
   139	  useEffect(() => {
   140	    const saved = localStorage.getItem('wp_theme')
   141	    if (saved) setDark(saved === 'dark')
   142	  }, [])
   143	
   144	  function toggleTheme() {
   145	    const next = !dark
   146	    setDark(next)
   147	    localStorage.setItem('wp_theme', next ? 'dark' : 'light')
   148	  }
   149	
   150	  useEffect(() => {
   151	    if (!user) { navigate('/'); return }
   152	  }, [user, navigate])
   153	
   154	  // Cronómetro de sesión
   155	  useEffect(() => {
   156	    if (screen !== 'session' || !sessionStartedAt || timeUp) return
   157	    timerRef.current = setInterval(() => {
   158	      const e = Date.now() - sessionStartedAt
   159	      setElapsed(e)
   160	      if (e >= sessionLimitMs) {
   161	        setTimeUp(true)
   162	        clearInterval(timerRef.current!)
   163	      }
   164	    }, 500)
   165	    return () => clearInterval(timerRef.current!)
   166	  }, [screen, sessionStartedAt, sessionLimitMs, timeUp])
   167	
   168	  // Cargar macrociclos
   169	  async function loadMacrocycles() {
   170	    setLoading(true)
   171	    try {
   172	      const data = await fetchMacrocycles()
   173	      setMacrocycles(data)
   174	    } catch (e) { console.error(e) }
   175	    finally { setLoading(false) }
   176	  }
   177	
   178	  async function goToList() {
   179	    await loadMacrocycles()
   180	    setScreen('list')
   181	  }
   182	
   183	  async function goToMacrocycle(id: number) {
   184	    setLoading(true)
   185	    try {
   186	      const data = await fetchMacrocycle(id)
   187	      setActiveMacrocycle(data)
   188	      setScreen('macrocycle')
   189	    } catch (e) { console.error(e) }
   190	    finally { setLoading(false) }
   191	  }
   192	
   193	  async function goToCycle(id: number) {
   194	    setLoading(true)
   195	    try {
   196	      const data = await fetchCycle(id)
   197	      setActiveCycle(data)
   198	      setScreen('cycle')
   199	    } catch (e) { console.error(e) }
   200	    finally { setLoading(false) }
   201	  }
   202	
   203	  async function goToReview(id: number) {
   204	    setLoading(true)
   205	    try {
   206	      const data = await fetchReview(id)
   207	      setActiveReview(data)
   208	      setSessionError(null)
   209	      setAvailableAt(null)
   210	      setScreen('review')
   211	    } catch (e) { console.error(e) }
   212	    finally { setLoading(false) }
   213	  }
   214	
   215	  async function handleStartSession(reviewId: number) {
   216	    setLoading(true)
   217	    setSessionError(null)
   218	    try {
   219	      const data = await startReviewSession(reviewId)
   220	      setSessionId(data.sessionId)
   221	      setCurrentPuzzle(data.puzzle)
   222	      setPuzzleIndex(data.puzzleIndex)
   223	      setSessionStartedAt(Date.now())
   224	      setSessionLimitMs(data.hoursPerDay * 3600 * 1000)
   225	      setElapsed(0)
   226	      setSessionSolved(0)
   227	      setPuzzleAttempts(0)
   228	      setHintUsed(false)
   229	      setHintSquare(null)
   230	      setTimeUp(false)
   231	      setSessionResult(null)
   232	      puzzleStartRef.current = Date.now()
   233	      setScreen('session')
   234	    } catch (e: unknown) {
   235	      const err = e as Error
   236	      if (err.message?.includes('disponible')) {
   237	        // Extraer availableAt del servidor
   238	        setSessionError(err.message)
   239	      } else {
   240	        setSessionError(err.message || 'Error al iniciar sesión')
   241	      }
   242	    } finally { setLoading(false) }
   243	  }
   244	
   245	  const handlePuzzleSolved = useCallback(async (_timeMs: number, errors: number) => {
   246	    if (!sessionId || !currentPuzzle) return
   247	    const timeMs = Date.now() - puzzleStartRef.current
   248	
   249	    try {
   250	      const result = await submitSessionPuzzle(sessionId, {
   251	        puzzleId: currentPuzzle.id,
   252	        attempts: puzzleAttempts + 1,
   253	        hintUsed,
   254	        timeMs,
   255	      })
   256	
   257	      correctSound.currentTime = 0
   258	      correctSound.play().catch(() => {})
   259	      setSessionSolved(s => s + 1)
   260	      setPuzzleAttempts(0)
   261	      setSolutionStep(0)
   262	      setHintUsed(false)
   263	      setHintSquare(null)
   264	
   265	      if (result.sessionComplete) {
   266	        // Tiempo agotado o pool terminado — cerrar sesión
   267	        const endResult = await endReviewSession(sessionId)
   268	        setSessionResult(endResult)
   269	        setTimeUp(true)
   270	      } else if (result.nextPuzzle) {
   271	        setCurrentPuzzle(result.nextPuzzle)
   272	        setPuzzleIndex(p => p + 1)
   273	        puzzleStartRef.current = Date.now()
   274	        if (result.elapsedMs !== undefined) setElapsed(result.elapsedMs)
   275	      }
   276	    } catch (e) { console.error(e) }
   277	  }, [sessionId, currentPuzzle, puzzleAttempts, hintUsed])
   278	
   279	  const handlePuzzleError = useCallback(() => {
   280	    errorSound.currentTime = 0
   281	    errorSound.play().catch(() => {})
   282	    setPuzzleAttempts(p => p + 1)
   283	  }, [])
   284	
   285	  function handleHint() {
   286	  if (!currentPuzzle) return
   287	  setHintUsed(true)
   288	  try {
   289	    const game = new Chess()
   290	    game.load(currentPuzzle.fen)
   291	    // Reproducir todos los movimientos hasta el turno actual
   292	    for (let i = 0; i < solutionStep; i++) {
   293	      game.move(currentPuzzle.solution[i])
   294	    }
   295	    const move = game.move(currentPuzzle.solution[solutionStep])
   296	    setHintSquare(move ? move.from : null)
   297	  } catch { setHintSquare(null) }
   298	}
   299	
   300	  async function handleTimeUpConfirm() {
   301	    if (!sessionId) return
   302	    setLoading(true)
   303	    try {
   304	      const result = await endReviewSession(sessionId)
   305	      setSessionResult(result)
   306	    } catch (e) { console.error(e) }
   307	    finally { setLoading(false) }
   308	  }
   309	
   310	  async function handleCreateMacrocycle() {
   311	    setCreating(true)
   312	    setCreateError(null)
   313	    try {
   314	      await createMacrocycle({
   315	        category: createCategory,
   316	        hoursPerDay: createHours,
   317	        reviewConfig: createConfig,
   318	      })
   319	      await goToList()
   320	    } catch (e: unknown) {
   321	      const err = e as Error
   322	      setCreateError(err.message || 'Error al crear')
   323	    } finally { setCreating(false) }
   324	  }
   325	
   326	  // THEME
   327	  const t = dark ? {
   328	    bg: 'bg-[#0A0A0F]', bg2: 'bg-[#12121A]', bg3: 'bg-[#1C1C28]',
   329	    border: 'border-[#1F1F2E]', borderLight: 'border-[#2A2A3A]',
   330	    text: 'text-[#E8E6E0]', text2: 'text-[#B8B5AC]', text3: 'text-[#7A776E]',
   331	    accent: 'text-[#D4A017]', accentBg: 'bg-[#D4A017]',
   332	    inputBg: 'bg-[#12121A] border-[#1F1F2E] text-[#E8E6E0]',
   333	    track: 'bg-[#1F1F2E]',
   334	  } : {
   335	    bg: 'bg-[#FAFAF7]', bg2: 'bg-[#F3EFE7]', bg3: 'bg-[#EDE8DF]',
   336	    border: 'border-[#E5DFD5]', borderLight: 'border-[#D9D2C8]',
   337	    text: 'text-[#1A1814]', text2: 'text-[#4A4640]', text3: 'text-[#8A8478]',
   338	    accent: 'text-[#A07810]', accentBg: 'bg-[#A07810]',
   339	    inputBg: 'bg-[#F3EFE7] border-[#E5DFD5] text-[#1A1814]',
   340	    track: 'bg-[#E5DFD5]',
   341	  }
   342	  const accentColor = dark ? '#D4A017' : '#A07810'
   343	
   344	  function Nav() {
   345	    return (
   346	      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95 transition-colors duration-300`}>
   347	        <div className="max-w-7xl mx-auto px-6 py-5">
   348	          <div className="flex items-start justify-between mb-6">
   349	            <div>
   350	              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
   351	              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user?.nickname}</h1>
   352	            </div>
   353	            <button onClick={toggleTheme} className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}>
   354	              {dark ? <SunIcon /> : <MoonIcon />}
   355	            </button>
   356	          </div>
   357	          <div className="flex items-center gap-0 overflow-x-auto pb-2">
   358	            {NAV_ITEMS.map((item, idx) => {
   359	              const isActive = location.pathname === item.path
   360	              return (
   361	                <div key={item.path} className="flex items-center">
   362	                  <button
   363	                    onClick={() => navigate(item.path)}
   364	                    className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all relative group ${isActive ? t.text : `${t.text2} hover:${t.text}`}`}
   365	                  >
   366	                    <span className="text-lg">{item.icon}</span>
   367	                    <span className="whitespace-nowrap">{item.label}</span>
   368	                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} style={{ backgroundColor: accentColor }} />
   369	                  </button>
   370	                  {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
   371	                </div>
   372	              )
   373	            })}
   374	          </div>
   375	        </div>
   376	      </nav>
   377	    )
   378	  }
   379	
   380	  function StatusBadge({ status }: { status: string }) {
   381	    const colors: Record<string, string> = {
   382	      active: 'bg-green-500 bg-opacity-20 text-green-400',
   383	      completed: 'bg-blue-500 bg-opacity-20 text-blue-400',
   384	      failed: 'bg-red-500 bg-opacity-20 text-red-400',
   385	    }
   386	    const labels: Record<string, string> = { active: 'Activo', completed: 'Completado', failed: 'Cancelado' }
   387	    return (
   388	      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${colors[status] || ''}`}>
   389	        {labels[status] || status}
   390	      </span>
   391	    )
   392	  }
   393	
   394	  // ── INTRO ─────────────────────────────────────────────────────────────────
   395	  if (screen === 'intro') {
   396	    return (
   397	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
   398	        <Nav />
   399	        <div className="max-w-3xl mx-auto px-6 py-20">
   400	          <div className="mb-12">
   401	            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Método Woodpecker</p>
   402	            <h2 className={`text-5xl font-bold ${t.text} leading-none mb-6`} style={{ letterSpacing: '-0.02em' }}>
   403	              Ciclos 🔄
   404	            </h2>
   405	            <p className={`text-lg ${t.text2} leading-relaxed max-w-xl`}>
   406	              El núcleo del método Woodpecker: resuelve cientos de puzzles en secuencia, repite el mismo bloque varias veces y mide tu mejora real ciclo a ciclo.
   407	            </p>
   408	          </div>
   409	
   410	          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-6`}>
   411	            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-6`}>Cómo funciona</p>
   412	            <div className="space-y-6">
   413	              {[
   414	                { icon: '🔄', title: 'Macrociclo', desc: 'Un macrociclo es el intento completo de pasar por todos los ejercicios de una categoría. Puedes tener uno activo por categoría.' },
   415	                { icon: '📦', title: 'Ciclo', desc: 'Cada ciclo cubre un tramo del pool de ejercicios. El siguiente ciclo arranca donde el anterior terminó.' },
   416	                { icon: '📋', title: 'Repaso', desc: 'Dentro de cada ciclo hay varios repasos. Cada repaso recorre el mismo tramo desde el principio. El objetivo es hacerlo más rápido cada vez.' },
   417	                { icon: '⏱️', title: 'Sesión diaria', desc: 'Cada repaso tiene N días de trabajo con horas fijas. Tienes un día de gracia: si saltas 2 días seguidos el repaso se cancela.' },
   418	                { icon: '💡', title: 'Pista', desc: 'Puedes pedir una pista en cualquier momento — se iluminará la pieza que debes mover. Sin costo en tus métricas.' },
   419	                { icon: '✅', title: 'Sin saltar', desc: 'No avanzas hasta resolver el puzzle correctamente. El cronómetro sigue corriendo aunque estés atascado.' },
   420	              ].map(step => (
   421	                <div key={step.title} className="flex gap-4">
   422	                  <div className="text-2xl flex-shrink-0 mt-0.5">{step.icon}</div>
   423	                  <div>
   424	                    <p className={`font-bold ${t.text} mb-1`}>{step.title}</p>
   425	                    <p className={`text-sm ${t.text2} leading-relaxed`}>{step.desc}</p>
   426	                  </div>
   427	                </div>
   428	              ))}
   429	            </div>
   430	          </div>
   431	
   432	          <div className={`rounded-xl ${t.bg3} ${t.border} border px-6 py-4 mb-10`}>
   433	            <p className={`text-xs ${t.text3} leading-relaxed`}>
   434	              💡 Por defecto los repasos siguen la progresión del libro: 7 días → 5 días → 3 días → 1 día, con días de descanso entre cada uno. Puedes personalizar esta configuración al crear un macrociclo.
   435	            </p>
   436	          </div>
   437	
   438	          <button
   439	            onClick={goToList}
   440	            className="px-10 py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:shadow-lg hover:scale-105"
   441	            style={{ backgroundColor: accentColor }}
   442	          >
   443	            Ver mis macrociclos
   444	          </button>
   445	        </div>
   446	        <div className={`${t.bg2} ${t.border} border-t mt-16`}>
   447	          <div className="max-w-7xl mx-auto px-6 py-6 flex justify-end">
   448	            <button onClick={logout} className={`px-5 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-medium ${t.text3} hover:${t.text} transition-all`}>Cerrar sesión</button>
   449	          </div>
   450	        </div>
   451	      </div>
   452	    )
   453	  }
   454	
   455	  // ── CREAR MACROCICLO ──────────────────────────────────────────────────────
   456	  if (screen === 'create') {
   457	    return (
   458	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
   459	        <Nav />
   460	        <div className="max-w-2xl mx-auto px-6 py-16">
   461	          <button onClick={() => setScreen('list')} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
   462	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
   463	            Volver
   464	          </button>
   465	
   466	          <div className="mb-10">
   467	            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Nuevo</p>
   468	            <h2 className={`text-4xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>Crear macrociclo</h2>
   469	          </div>
   470	
   471	          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 space-y-8`}>
   472	            {/* Categoría */}
   473	            <div>
   474	              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Categoría</label>
   475	              <select
   476	                value={createCategory}
   477	                onChange={e => setCreateCategory(e.target.value)}
   478	                className={`w-full px-4 py-3 rounded-lg border focus:outline-none font-semibold ${t.inputBg} ${t.border}`}
   479	              >
   480	                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
   481	              </select>
   482	            </div>
   483	
   484	            {/* Horas por día */}
   485	            <div>
   486	              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>Horas de trabajo por día</label>
   487	              <div className="flex items-center gap-4">
   488	                <input
   489	                  type="number"
   490	                  min={0.5} max={8} step={0.5}
   491	                  value={createHours}
   492	                  onChange={e => setCreateHours(Number(e.target.value))}
   493	                  className={`w-28 px-4 py-3 rounded-lg border focus:outline-none font-semibold text-center ${t.inputBg} ${t.border}`}
   494	                />
   495	                <p className={`text-sm ${t.text3}`}>{createHours}h por sesión</p>
   496	              </div>
   497	            </div>
   498	
   499	            {/* Config de repasos */}
   500	            <div>
   501	              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Configuración de repasos</label>
   502	              <div className="space-y-3">
   503	                {createConfig.map((rc, idx) => (
   504	                  <div key={idx} className={`flex items-center gap-4 p-4 rounded-lg ${t.bg3}`}>
   505	                    <span className={`text-sm font-bold w-20 ${t.text3}`}>Repaso {rc.review_number}</span>
   506	                    <div className="flex items-center gap-2 flex-1">
   507	                      <input
   508	                        type="number" min={1} max={30}
   509	                        value={rc.days_work}
   510	                        onChange={e => {
   511	                          const next = [...createConfig]
   512	                          next[idx] = { ...next[idx], days_work: Number(e.target.value) }
   513	                          setCreateConfig(next)
   514	                        }}
   515	                        className={`w-16 px-2 py-1.5 rounded-lg border text-center text-sm font-semibold ${t.inputBg} ${t.border}`}
   516	                      />
   517	                      <span className={`text-xs ${t.text3}`}>días trabajo</span>
   518	                    </div>
   519	                    <div className="flex items-center gap-2 flex-1">
   520	                      <input
   521	                        type="number" min={0} max={14}
   522	                        value={rc.days_rest}
   523	                        onChange={e => {
   524	                          const next = [...createConfig]
   525	                          next[idx] = { ...next[idx], days_rest: Number(e.target.value) }
   526	                          setCreateConfig(next)
   527	                        }}
   528	                        className={`w-16 px-2 py-1.5 rounded-lg border text-center text-sm font-semibold ${t.inputBg} ${t.border}`}
   529	                      />
   530	                      <span className={`text-xs ${t.text3}`}>días descanso</span>
   531	                    </div>
   532	                  </div>
   533	                ))}
   534	              </div>
   535	            </div>
   536	
   537	            {createError && (
   538	              <div className="px-4 py-3 rounded-lg border text-sm font-semibold" style={{ backgroundColor: 'rgba(231,76,60,0.08)', borderColor: 'rgba(231,76,60,0.3)', color: '#E74C3C' }}>
   539	                {createError}
   540	              </div>
   541	            )}
   542	
   543	            <button
   544	              onClick={handleCreateMacrocycle}
   545	              disabled={creating}
   546	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 disabled:opacity-50"
   547	              style={{ backgroundColor: accentColor }}
   548	            >
   549	              {creating ? 'Creando...' : 'Crear macrociclo'}
   550	            </button>
   551	          </div>
   552	        </div>
   553	      </div>
   554	    )
   555	  }
   556	
   557	  // ── LISTA DE MACROCICLOS ──────────────────────────────────────────────────
   558	  if (screen === 'list') {
   559	    return (
   560	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
   561	        <Nav />
   562	        <div className="max-w-4xl mx-auto px-6 py-16">
   563	          <div className="flex items-end justify-between mb-12">
   564	            <div>
   565	              <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Método Woodpecker</p>
   566	              <h2 className={`text-5xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>Mis macrociclos</h2>
   567	            </div>
   568	            <button
   569	              onClick={() => setScreen('create')}
   570	              className="px-6 py-3 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:scale-105"
   571	              style={{ backgroundColor: accentColor }}
   572	            >
   573	              + Nuevo
   574	            </button>
   575	          </div>
   576	
   577	          {loading ? (
   578	            <p className={`text-center py-20 ${t.text3}`}>Cargando...</p>
   579	          ) : macrocycles.length === 0 ? (
   580	            <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
   581	              <p className="text-4xl mb-4">🔄</p>
   582	              <p className={`text-lg ${t.text2} mb-2`}>No tienes macrociclos aún</p>
   583	              <p className={`text-sm ${t.text3}`}>Crea uno para empezar tu método Woodpecker</p>
   584	            </div>
   585	          ) : (
   586	            <div className="space-y-4">
   587	              {macrocycles.map(m => {
   588	                const catLabel = CATEGORIES.find(c => c.id === m.category)?.label || m.category
   589	                return (
   590	                  <button
   591	                    key={m.id}
   592	                    onClick={() => goToMacrocycle(m.id)}
   593	                    className={`w-full text-left rounded-xl ${t.bg2} ${t.border} border p-6 transition-all hover:shadow-lg hover:-translate-y-0.5`}
   594	                  >
   595	                    <div className="flex items-center justify-between">
   596	                      <div>
   597	                        <div className="flex items-center gap-3 mb-2">
   598	                          <h3 className={`text-lg font-bold ${t.text}`}>{catLabel}</h3>
   599	                          <StatusBadge status={m.status} />
   600	                        </div>
   601	                        <p className={`text-sm ${t.text3}`}>Iniciado {formatDate(m.createdAt)} · {m.hoursPerDay}h/día · Ejercicio {m.globalPuzzlePointer} alcanzado</p>
   602	                      </div>
   603	                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
   604	                        <polyline points="9 18 15 12 9 6"/>
   605	                      </svg>
   606	                    </div>
   607	                  </button>
   608	                )
   609	              })}
   610	            </div>
   611	          )}
   612	        </div>
   613	      </div>
   614	    )
   615	  }
   616	
   617	  // ── DETALLE DE MACROCICLO ─────────────────────────────────────────────────
   618	  if (screen === 'macrocycle' && activeMacrocycle) {
   619	    const catLabel = CATEGORIES.find(c => c.id === activeMacrocycle.category)?.label || activeMacrocycle.category
   620	    return (
   621	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
   622	        <Nav />
   623	        <div className="max-w-4xl mx-auto px-6 py-16">
   624	          <button onClick={goToList} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
   625	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
   626	            Mis macrociclos
   627	          </button>
   628	
   629	          <div className="mb-12">
   630	            <div className="flex items-center gap-3 mb-2">
   631	              <p className={`text-sm uppercase tracking-[0.15em] ${t.text3}`}>{catLabel}</p>
   632	              <StatusBadge status={activeMacrocycle.status} />
   633	            </div>
   634	            <h2 className={`text-4xl font-bold ${t.text} leading-none mb-4`} style={{ letterSpacing: '-0.02em' }}>
   635	              Macrociclo
   636	            </h2>
   637	            <div className={`flex gap-6 text-sm ${t.text3}`}>
   638	              <span>🕐 {activeMacrocycle.hoursPerDay}h por sesión</span>
   639	              <span>📍 Ejercicio {activeMacrocycle.globalPuzzlePointer} alcanzado</span>
   640	              <span>📅 Iniciado {formatDate(activeMacrocycle.createdAt)}</span>
   641	            </div>
   642	          </div>
   643	
   644	          <div className="mb-6">
   645	            <h3 className={`text-xl font-bold ${t.text} mb-4`}>Ciclos</h3>
   646	            {!activeMacrocycle.cycles || activeMacrocycle.cycles.length === 0 ? (
   647	              <p className={`text-sm ${t.text3}`}>No hay ciclos aún</p>
   648	            ) : (
   649	              <div className="space-y-3">
   650	                {activeMacrocycle.cycles.map(c => (
   651	                  <button
   652	                    key={c.id}
   653	                    onClick={() => goToCycle(c.id)}
   654	                    className={`w-full text-left rounded-xl ${t.bg2} ${t.border} border p-5 transition-all hover:shadow-lg hover:-translate-y-0.5`}
   655	                  >
   656	                    <div className="flex items-center justify-between">
   657	                      <div>
   658	                        <div className="flex items-center gap-3 mb-1">
   659	                          <h4 className={`font-bold ${t.text}`}>Ciclo {c.cycleNumber}</h4>
   660	                          <StatusBadge status={c.status} />
   661	                        </div>
   662	                        <p className={`text-sm ${t.text3}`}>
   663	                          Ejercicios {c.puzzleStart + 1}–{c.puzzleEnd ? c.puzzleEnd : '?'} · Iniciado {formatDate(c.createdAt)}
   664	                        </p>
   665	                      </div>
   666	                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
   667	                        <polyline points="9 18 15 12 9 6"/>
   668	                      </svg>
   669	                    </div>
   670	                  </button>
   671	                ))}
   672	              </div>
   673	            )}
   674	          </div>
   675	        </div>
   676	      </div>
   677	    )
   678	  }
   679	
   680	  // ── DETALLE DE CICLO ──────────────────────────────────────────────────────
   681	  if (screen === 'cycle' && activeCycle) {
   682	    return (
   683	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
   684	        <Nav />
   685	        <div className="max-w-4xl mx-auto px-6 py-16">
   686	          <button onClick={() => activeMacrocycle && goToMacrocycle(activeMacrocycle.id)} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
   687	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
   688	            Macrociclo
   689	          </button>
   690	
   691	          <div className="mb-12">
   692	            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-2`}>Ciclo {activeCycle.cycleNumber}</p>
   693	            <h2 className={`text-4xl font-bold ${t.text} leading-none mb-4`} style={{ letterSpacing: '-0.02em' }}>
   694	              Ejercicios {activeCycle.puzzleStart + 1}–{activeCycle.puzzleEnd ?? '?'}
   695	            </h2>
   696	            <StatusBadge status={activeCycle.status} />
   697	          </div>
   698	
   699	          <h3 className={`text-xl font-bold ${t.text} mb-4`}>Repasos</h3>
   700	          <div className="space-y-3">
   701	            {activeCycle.reviews?.map(r => {
   702	              const sessionsCount = r.sessions?.length || 0
   703	              return (
   704	                <button
   705	                  key={r.id}
   706	                  onClick={() => goToReview(r.id)}
   707	                  className={`w-full text-left rounded-xl ${t.bg2} ${t.border} border p-5 transition-all hover:shadow-lg hover:-translate-y-0.5`}
   708	                >
   709	                  <div className="flex items-center justify-between">
   710	                    <div>
   711	                      <div className="flex items-center gap-3 mb-1">
   712	                        <h4 className={`font-bold ${t.text}`}>Repaso {r.reviewNumber}</h4>
   713	                        <StatusBadge status={r.status} />
   714	                      </div>
   715	                      <p className={`text-sm ${t.text3}`}>
   716	                        {sessionsCount}/{r.daysWork} días · {r.daysRest} días descanso después
   717	                      </p>
   718	                    </div>
   719	                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={t.text3}>
   720	                      <polyline points="9 18 15 12 9 6"/>
   721	                    </svg>
   722	                  </div>
   723	                </button>
   724	              )
   725	            })}
   726	          </div>
   727	        </div>
   728	      </div>
   729	    )
   730	  }
   731	
   732	  // ── DETALLE DE REPASO ─────────────────────────────────────────────────────
   733	  if (screen === 'review' && activeReview) {
   734	    const sessionsDone = activeReview.sessions?.filter(s => s.status === 'completed').length || 0
   735	    const lastSession = activeReview.sessions?.filter(s => s.status === 'completed').sort((a, b) => b.dayNumber - a.dayNumber)[0]
   736	    const nextAvailable = lastSession
   737	        ? new Date(new Date(lastSession.startedAt.endsWith('Z') ? lastSession.startedAt : lastSession.startedAt + 'Z').getTime() + 24 * 3600 * 1000).toISOString()
   738	        : null
   739	    const canStart = activeReview.status === 'active' && sessionsDone < activeReview.daysWork && (!nextAvailable || new Date() >= new Date(nextAvailable))
   740	
   741	    return (
   742	      <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
   743	        <Nav />
   744	        <div className="max-w-3xl mx-auto px-6 py-16">
   745	          <button onClick={() => activeCycle && goToCycle(activeCycle.id)} className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors mb-10`}>
   746	            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
   747	            Ciclo
   748	          </button>
   749	
   750	          <div className="mb-10">
   751	            <div className="flex items-center gap-3 mb-2">
   752	              <p className={`text-sm uppercase tracking-[0.15em] ${t.text3}`}>Repaso {activeReview.reviewNumber}</p>
   753	              <StatusBadge status={activeReview.status} />
   754	            </div>
   755	            <h2 className={`text-4xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>
   756	              Día {sessionsDone + 1} de {activeReview.daysWork}
   757	            </h2>
   758	          </div>
   759	
   760	          {/* Progreso de días */}
   761	          <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 mb-6`}>
   762	            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-4`}>Progreso del repaso</p>
   763	            <div className="flex gap-2 mb-4">
   764	              {Array.from({ length: activeReview.daysWork }).map((_, i) => (
   765	                <div
   766	                  key={i}
   767	                  className="flex-1 h-3 rounded-full"
   768	                  style={{ backgroundColor: i < sessionsDone ? accentColor : (dark ? '#1F1F2E' : '#E5DFD5') }}
   769	                />
   770	              ))}
   771	            </div>
   772	            <p className={`text-sm ${t.text2}`}>{sessionsDone} de {activeReview.daysWork} días completados</p>
   773	          </div>
   774	
   775	          {/* Disponibilidad */}
   776	          {nextAvailable && new Date() < new Date(nextAvailable) && (
   777	            <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 mb-6`}>
   778	              <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-2`}>Próxima sesión</p>
   779	              <p className={`text-2xl font-bold`} style={{ color: accentColor }}>{timeUntil(nextAvailable)}</p>
   780	              <p className={`text-xs ${t.text3} mt-1`}>Disponible a las {new Date(nextAvailable).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
   781	            </div>
   782	          )}
   783	
   784	          {sessionError && (
   785	            <div className="px-4 py-3 rounded-lg border text-sm font-semibold mb-4" style={{ backgroundColor: 'rgba(231,76,60,0.08)', borderColor: 'rgba(231,76,60,0.3)', color: '#E74C3C' }}>
   786	              {sessionError}
   787	            </div>
   788	          )}
   789	
   790	          {canStart && (
   791	            <button
   792	              onClick={() => handleStartSession(activeReview.id)}
   793	              disabled={loading}
   794	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:scale-105 disabled:opacity-50"
   795	              style={{ backgroundColor: accentColor }}
   796	            >
   797	              {loading ? 'Iniciando...' : `Iniciar día ${sessionsDone + 1}`}
   798	            </button>
   799	          )}
   800	
   801	          {activeReview.status === 'failed' && (
   802	            <button
   803	              onClick={() => handleStartSession(activeReview.id)}
   804	              disabled={loading}
   805	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 disabled:opacity-50"
   806	              style={{ backgroundColor: '#E74C3C' }}
   807	            >
   808	              {loading ? 'Reiniciando...' : 'Reiniciar repaso'}
   809	            </button>
   810	          )}
   811	
   812	          {/* Historial de sesiones */}
   813	          {activeReview.sessions && activeReview.sessions.length > 0 && (
   814	            <div className="mt-10">
   815	              <h3 className={`text-lg font-bold ${t.text} mb-4`}>Sesiones anteriores</h3>
   816	              <div className="space-y-3">
   817	                {activeReview.sessions.map(s => (
   818	                  <div key={s.id} className={`rounded-xl ${t.bg2} ${t.border} border p-4 flex items-center justify-between`}>
   819	                    <div>
   820	                      <p className={`font-bold ${t.text}`}>Día {s.dayNumber}</p>
   821	                      <p className={`text-xs ${t.text3}`}>{formatDate(s.startedAt)}</p>
   822	                    </div>
   823	                    <div className="flex items-center gap-6">
   824	                      <div className="text-right">
   825	                        <p className={`text-xs ${t.text3} mb-1`}>Puzzles</p>
   826	                        <p className={`font-bold ${t.text}`}>{s.puzzlesSolved}</p>
   827	                      </div>
   828	                      <StatusBadge status={s.status} />
   829	                    </div>
   830	                  </div>
   831	                ))}
   832	              </div>
   833	            </div>
   834	          )}
   835	        </div>
   836	      </div>
   837	    )
   838	  }
   839	
   840	  // ── SESIÓN ACTIVA ─────────────────────────────────────────────────────────
   841	  if (screen === 'session') {
   842	    const remaining = Math.max(0, sessionLimitMs - elapsed)
   843	    const progress = sessionLimitMs > 0 ? Math.min(1, elapsed / sessionLimitMs) : 0
   844	    const timerWarning = remaining < 5 * 60 * 1000 // últimos 5 minutos
   845	
   846	    // Pantalla de resultado al terminar
   847	    if (timeUp && sessionResult !== null) {
   848	      return (
   849	        <div className={`min-h-screen ${t.bg} flex items-center justify-center px-6 transition-colors duration-300`}>
   850	          <div className={`w-full max-w-md text-center rounded-2xl ${t.bg2} ${t.border} border p-10`}>
   851	            {sessionResult.macrocycleComplete ? (
   852	              <>
   853	                <div className="text-6xl mb-4">🏆</div>
   854	                <h2 className={`text-3xl font-bold mb-2`} style={{ color: accentColor }}>¡Macrociclo completo!</h2>
   855	                <p className={`text-sm ${t.text3} mb-8`}>Has completado todos los ejercicios. Puedes iniciar un nuevo macrociclo.</p>
   856	              </>
   857	            ) : sessionResult.cycleComplete ? (
   858	              <>
   859	                <div className="text-6xl mb-4">✨</div>
   860	                <h2 className={`text-3xl font-bold ${t.text} mb-2`}>¡Ciclo completado!</h2>
   861	                <p className={`text-sm ${t.text3} mb-8`}>El siguiente ciclo arrancará desde donde quedaste.</p>
   862	              </>
   863	            ) : sessionResult.reviewComplete ? (
   864	              <>
   865	                <div className="text-6xl mb-4">🎯</div>
   866	                <h2 className={`text-3xl font-bold ${t.text} mb-2`}>¡Repaso completado!</h2>
   867	                <p className={`text-sm ${t.text3} mb-8`}>{sessionResult.restDays ? `${sessionResult.restDays} días de descanso antes del próximo repaso.` : 'El siguiente repaso empieza desde el principio del tramo.'}</p>
   868	              </>
   869	            ) : (
   870	              <>
   871	                <div className="text-6xl mb-4">⏱️</div>
   872	                <h2 className={`text-3xl font-bold ${t.text} mb-2`}>Sesión completada</h2>
   873	                <p className={`text-sm ${t.text3} mb-2`}><span className="font-bold" style={{ color: accentColor }}>{sessionSolved}</span> puzzles resueltos hoy</p>
   874	                <p className={`text-sm ${t.text3} mb-8`}>Vuelve mañana para continuar desde donde quedaste.</p>
   875	              </>
   876	            )}
   877	            <button
   878	              onClick={() => { setScreen('review'); activeReview && goToReview(activeReview.id) }}
   879	              className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90"
   880	              style={{ backgroundColor: accentColor }}
   881	            >
   882	              Volver al repaso
   883	            </button>
   884	          </div>
   885	        </div>
   886	      )
   887	    }
   888	
   889	  // Tiempo agotado — cerrar sesión inmediatamente
   890	  if (timeUp && sessionResult === null) {
   891	  // Llamar endSession automáticamente si no se ha llamado aún
   892	  if (sessionId && !loading) {
   893	    handleTimeUpConfirm()
   894	  }
   895	  return (
   896	    <div className={`min-h-screen ${t.bg} flex items-center justify-center px-6 transition-colors duration-300`}>
   897	      <div className={`w-full max-w-md text-center rounded-2xl ${t.bg2} ${t.border} border p-10`}>
   898	        <div className="text-6xl mb-4">⏰</div>
   899	        <h2 className={`text-3xl font-bold ${t.text} mb-2`}>Tiempo agotado</h2>
   900	        <p className={`text-sm ${t.text3} mb-2`}>
   901	          <span className="font-bold" style={{ color: accentColor }}>{sessionSolved}</span> puzzles resueltos hoy
   902	        </p>
   903	        <p className={`text-sm ${t.text3}`}>Cerrando sesión...</p>
   904	      </div>
   905	    </div>
   906	  )
   907	}
   908	
   909	    const subcatInfo = currentPuzzle?.subcategory ? SUBCATEGORY_LABELS[currentPuzzle.subcategory] : null
   910	
   911	    return (
   912	      <div className={`min-h-screen ${t.bg} flex flex-col transition-colors duration-300`}>
   913	        {/* HUD */}
   914	        <div className={`${t.bg2} ${t.border} border-b sticky top-0 z-40 backdrop-blur-xl`}>
   915	          <div className="max-w-6xl mx-auto px-6 py-4">
   916	            <div className="flex items-center justify-between mb-3">
   917	              {/* Timer */}
   918	              <div>
   919	                <p className={`text-xs uppercase tracking-widest ${t.text3} mb-0.5`}>Tiempo restante</p>
   920	                <div
   921	                  className="text-3xl font-bold font-mono"
   922	                  style={{ color: timerWarning ? '#E74C3C' : accentColor, letterSpacing: '-0.02em' }}
   923	                >
   924	                  {formatHMS(remaining)}
   925	                </div>
   926	              </div>
   927	
   928	              {/* Puzzle counter + subcategory */}
   929	              <div className="text-center">
   930	                {subcatInfo && (
   931	                  <span
   932	                    className="text-xs px-3 py-1 rounded-full font-bold mb-1 inline-block"
   933	                    style={{ backgroundColor: `${subcatInfo.color}20`, color: subcatInfo.color }}
   934	                  >
   935	                    {subcatInfo.label}
   936	                  </span>
   937	                )}
   938	                <p className={`text-xs uppercase tracking-widest ${t.text3}`}>Puzzle</p>
   939	                <p className={`text-2xl font-bold ${t.text}`}>{sessionSolved + 1}</p>
   940	              </div>
   941	
   942	              {/* Acciones */}
   943	              <div className="flex items-center gap-3">
   944	                <button
   945	                  onClick={handleHint}
   946	                  className={`px-4 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-semibold transition-all hover:shadow-md`}
   947	                  style={{ color: hintUsed ? accentColor : undefined }}
   948	                  title="Ver pista"
   949	                >
   950	                  💡 Pista
   951	                </button>
   952	                <button onClick={toggleTheme} className={`flex items-center justify-center w-9 h-9 rounded-lg ${t.bg3} ${t.border} border ${t.text3}`}>
   953	                  {dark ? <SunIcon /> : <MoonIcon />}
   954	                </button>
   955	              </div>
   956	            </div>
   957	
   958	            {/* Barra de tiempo */}
   959	            <div className={`h-1 ${t.track} rounded-full overflow-hidden`}>
   960	              <div
   961	                className="h-full rounded-full transition-all duration-500"
   962	                style={{ width: `${(1 - progress) * 100}%`, backgroundColor: timerWarning ? '#E74C3C' : accentColor }}
   963	              />
   964	            </div>
   965	          </div>
   966	        </div>
   967	
   968	        {/* Board */}
   969	        <div className="flex-1 flex items-start justify-center pt-8 px-6">
   970	          <div className="w-full max-w-[520px]">
   971	            {currentPuzzle && (
   972	              <PuzzleBoard
   973	                key={currentPuzzle.id}
   974	                puzzle={currentPuzzle}
   975	                onSolved={handlePuzzleSolved}
   976	                onError={handlePuzzleError}
   977	                externalHighlights={hintSquare ? [hintSquare] : []}
   978	                autoSkipAfterErrors={0}
   979	              />
   980	            )}
   981	          </div>
   982	        </div>
   983	      </div>
   984	    )
   985	  }
   986	
   987	  return null
   988	}
