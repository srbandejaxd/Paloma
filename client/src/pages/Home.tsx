import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { register, loginApi } from '../lib/api'
import { useAuth } from '../lib/auth'

type Mode = 'login' | 'register'

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

const FEATURES = [
  {
    icon: '🔄',
    title: 'Ciclos — el núcleo del método',
    desc: 'La herramienta principal. Organiza tu entrenamiento en macrociclos, ciclos y repasos exactamente como indica el libro de Axel Smith. Cada repaso recorre los mismos puzzles; cada vez deberías ser más rápido.',
    highlight: true,
  },
  {
    icon: '⚡',
    title: 'Puzzles libres',
    desc: 'Accede a cualquier puzzle de cualquier bloque para practicar sin estructura. Útil para explorar o repasar puzzles específicos que fallaste.',
    highlight: false,
  },
  {
    icon: '📈',
    title: 'Historial y seguimiento',
    desc: 'Cada sesión queda registrada con tiempo, errores y score. Ves exactamente cuánto mejoraste de un repaso al siguiente.',
    highlight: false,
  },
  {
    icon: '🏆',
    title: 'Ranking global',
    desc: 'Compite con otros jugadores por el mejor tiempo en cada bloque de puzzles y en el modo de visión.',
    highlight: false,
  },
  {
    icon: '👁',
    title: 'Entrenamiento visual',
    desc: 'Reconoce coordenadas del tablero a velocidad. 30 segundos, máximos aciertos. Un complemento rápido para el entrenamiento diario.',
    highlight: false,
  },
  {
    icon: '♟',
    title: 'Ajedrez ciego',
    desc: 'Memoriza la posición y juega sin ver las piezas. El nivel más alto de entrenamiento táctico.',
    highlight: false,
  },
]

export default function Home() {
  const [mode, setMode] = useState<Mode>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dark, setDark] = useState(true)
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const saved = localStorage.getItem('wp_theme')
    if (saved) setDark(saved === 'dark')
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('wp_theme', next ? 'dark' : 'light')
  }

  async function handleSubmit() {
    setError('')
    if (!nickname.trim() || !password.trim()) { setError('Completa todos los campos'); return }
    setLoading(true)
    try {
      const data = mode === 'register'
        ? await register(nickname.trim(), password)
        : await loginApi(nickname.trim(), password)
      login(data.nickname, data.token)
      navigate('/home')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Theme tokens
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
    pill: 'bg-[#1C1C28] border-[#252535]',
    toggleBg: 'bg-[#1C1C28] border-[#252535] text-[#7A776E] hover:text-[#E8E6E0]',
    heroBadge: 'bg-[#1C1C28] border-[#252535] text-[#D4A017]',
    divider: 'border-[#252535]',
    footerText: 'text-[#252535]',
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
    pill: 'bg-[#E2DBD0] border-[#D4CABF]',
    toggleBg: 'bg-[#E2DBD0] border-[#D4CABF] text-[#8A8478] hover:text-[#1A1814]',
    heroBadge: 'bg-[#E2DBD0] border-[#D4CABF] text-[#A07810]',
    divider: 'border-[#D4CABF]',
    footerText: 'text-[#D4CABF]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300`}>

      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 ${t.bg} border-b ${t.border} backdrop-blur-sm bg-opacity-90`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🪃</span>
            <span className={`font-bold text-sm tracking-widest uppercase ${t.text}`}>Woodpecker</span>
          </div>
          <button
            onClick={toggleTheme}
            className={`p-2 border rounded-sm transition-all ${t.toggleBg} ${t.border}`}
            title={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left: copy */}
            <div className="animate-slide-up">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 border rounded-sm text-xs tracking-widest uppercase mb-8 ${t.heroBadge}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                Método Woodpecker
              </div>

              <h1 className={`text-5xl lg:text-6xl font-bold leading-none mb-6 ${t.text}`} style={{ letterSpacing: '-0.02em' }}>
                Repite.<br />
                <span style={{ color: accentColor }}>Acelera.</span><br />
                Domina.
              </h1>

              <p className={`text-base leading-relaxed mb-8 max-w-md ${t.text2}`}>
                El método Woodpecker es simple: resuelves el mismo set de puzzles tácticos una y otra vez,
                cada vez más rápido. No se trata de ver puzzles nuevos — se trata de que los patrones
                entren tan profundo que los reconozcas antes de pensar.
              </p>

              <div className={`flex items-center gap-6 text-sm ${t.text3}`}>
                <div className="flex items-center gap-2">
                  <span style={{ color: accentColor }}>—</span>
                  <span>GM Axel Smith & Hans Tikkanen</span>
                </div>
              </div>
            </div>

            {/* Right: login form */}
            <div className={`border rounded-sm p-8 ${t.cardBg} ${t.border}`}>
              <div className={`flex mb-6 border rounded-sm p-1 ${t.pill} ${t.border}`}>
                {(['login', 'register'] as Mode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError('') }}
                    className={`flex-1 py-2 text-xs uppercase tracking-widest rounded-sm transition-all ${
                      mode === m
                        ? `${t.accentBg} text-[#0A0A0F] font-bold`
                        : `${t.text3} hover:${t.text}`
                    }`}
                  >
                    {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Nickname"
                  autoComplete="username"
                  className={`w-full border text-sm px-4 py-3 rounded-sm outline-none transition-colors ${t.inputBg} ${t.text} placeholder:${t.text3}`}
                  style={{ fontFamily: 'inherit' }}
                />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className={`w-full border text-sm px-4 py-3 rounded-sm outline-none transition-colors ${t.inputBg} ${t.text} placeholder:${t.text3}`}
                  style={{ fontFamily: 'inherit' }}
                />

                {error && <p className="text-red-500 text-xs px-1">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className={`w-full py-3.5 ${t.accentBg} text-[#0A0A0F] font-bold text-sm tracking-widest uppercase rounded-sm transition-opacity disabled:opacity-50 hover:opacity-90`}
                >
                  {loading ? 'Cargando...' : mode === 'login' ? 'Entrar →' : 'Crear cuenta →'}
                </button>
              </div>

              <p className={`text-xs mt-4 text-center ${t.text3}`}>
                {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
                <button
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
                  className={`underline ${t.accent}`}
                >
                  {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className={`border-t ${t.divider}`} />

      {/* Por qué Woodpecker */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-14">
            <p className={`text-xs uppercase tracking-widest mb-4 ${t.text3}`}>El problema con los puzzles tradicionales</p>
            <h2 className={`text-3xl font-bold mb-5 ${t.text}`} style={{ letterSpacing: '-0.02em' }}>
              Resolver puzzles variados no es suficiente
            </h2>
            <p className={`text-sm leading-relaxed ${t.text2}`}>
              La mayoría de jugadores hace 10 puzzles nuevos cada día. Se sienten productivos. Pero al día siguiente
              no recuerdan ninguno. La memoria necesita repetición espaciada para retener los patrones.
              El método Woodpecker resuelve exactamente eso.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                label: 'Puzzles variados',
                points: [
                  'Siempre algo nuevo',
                  'Sensación de progreso inmediato',
                  'Patrones olvidados en 48h',
                  'Difícil medir mejora real',
                ],
                bad: true,
              },
              {
                label: 'Método Woodpecker',
                points: [
                  'Mismo set, repetido N veces',
                  'Cada ciclo más rápido',
                  'Patrones grabados en memoria muscular',
                  'Tiempo por ciclo = métrica exacta',
                ],
                bad: false,
              },
              {
                label: 'La curva del olvido',
                points: [
                  'Sin repaso: pierdes el 70% en 24h',
                  'Con repaso a tiempo: retención duradera',
                  'La velocidad de solución mide retención',
                  'Menos tiempo = más automatizado',
                ],
                bad: null,
              },
            ].map(({ label, points, bad }) => (
              <div key={label} className={`border rounded-sm p-6 ${t.cardBg} ${t.border} ${bad === false ? `border-l-2` : ''}`}
                style={bad === false ? { borderLeftColor: accentColor } : {}}>
                <div className={`text-xs uppercase tracking-widest mb-4 font-bold ${bad === false ? '' : t.text3}`}
                  style={bad === false ? { color: accentColor } : {}}>
                  {label}
                </div>
                <ul className="space-y-2">
                  {points.map((p, i) => (
                    <li key={i} className={`text-sm flex items-start gap-2 ${t.text2}`}>
                      <span className="mt-0.5 shrink-0" style={{
                        color: bad === true ? '#E74C3C' : bad === false ? accentColor : t.text3 as string
                      }}>
                        {bad === true ? '✗' : bad === false ? '✓' : '·'}
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={`border-t ${t.divider}`} />

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-14">
            <p className={`text-xs uppercase tracking-widest mb-4 ${t.text3}`}>Lo que incluye la plataforma</p>
            <h2 className={`text-3xl font-bold ${t.text}`} style={{ letterSpacing: '-0.02em' }}>
              Todo lo que necesitas para mejorar
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon, title, desc, highlight }, idx) => (
              <div
                key={title}
                className={`border rounded-sm p-6 transition-colors ${t.cardBg} ${t.border} hover:border-opacity-70 ${idx === 0 ? 'md:col-span-2 lg:col-span-3' : ''}`}
                style={highlight ? { borderLeftWidth: 2, borderLeftColor: accentColor } : {}}
              >
                <div className="flex items-start gap-4">
                  <div className={`text-2xl mt-0.5 flex-shrink-0`}>{icon}</div>
                  <div>
                    <div className={`text-sm font-bold mb-2 flex items-center gap-3 ${t.text}`}>
                      {title}
                      {highlight && (
                        <span className="text-xs px-2 py-0.5 rounded-sm font-bold uppercase tracking-widest" style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>
                          Principal
                        </span>
                      )}
                    </div>
                    <div className={`text-xs leading-relaxed ${t.text3}`}>{desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={`border-t ${t.divider}`} />

      {/* CTA bottom */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className={`text-3xl font-bold mb-4 ${t.text}`} style={{ letterSpacing: '-0.02em' }}>
            El primer ciclo es el más lento.<br />
            <span style={{ color: accentColor }}>El siguiente será más rápido.</span>
          </h2>
          <p className={`text-sm mb-8 ${t.text3}`}>Crea tu cuenta gratis y empieza hoy.</p>
          <button
            onClick={() => { setMode('register'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            className={`px-8 py-3.5 ${t.accentBg} text-[#0A0A0F] font-bold text-sm tracking-widest uppercase rounded-sm hover:opacity-90 transition-opacity`}
          >
            Empezar ahora →
          </button>
        </div>
      </section>

      {/* Footer */}
      <div className={`border-t ${t.divider} py-8 px-6`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">🪃</span>
            <span className={`text-xs tracking-widest uppercase ${t.text3}`}>Woodpecker</span>
          </div>
          <span className={`text-xs ${t.text3}`}>Método GM Axel Smith & Hans Tikkanen</span>
        </div>
      </div>
    </div>
  )
}
