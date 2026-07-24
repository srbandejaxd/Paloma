import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

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
  { path: '/home',        label: 'Home',      icon: '🏠' },
  { path: '/cycles',      label: 'Ciclos',    icon: '🕊️' },
  { path: '/solo',        label: 'Solo',      icon: '⚡' },
  { path: '/puzzles',     label: 'Puzzles',   icon: '📚' },
  { path: '/vision',      label: 'Visión',    icon: '👁' },
  { path: '/history',     label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking',   icon: '🏆' },
  { path: '/blind',       label: 'Ciego',     icon: '🎲' },
]

const SECTIONS = [
  {
    path: '/cycles',
    icon: '🕊️',
    label: 'La Paloma · Ciclos',
    tag: 'Método principal',
    headline: 'El núcleo de tu entrenamiento',
    body: 'Aquí es donde ocurre el trabajo real. Crea un macrociclo para una categoría de puzzles y el sistema te guía a través de 4 repasos del mismo material. Cada repaso recorre los mismos ejercicios desde el principio — el objetivo no es ver más puzzles, sino resolver los mismos en menos tiempo cada vez.\n\nLa Paloma aplica repetición espaciada inversa: el primer repaso es el más largo (cuando el material es nuevo), el último el más corto (cuando ya está consolidado). Exactamente lo contrario al método Woodpecker original, y fundamentado en la curva del olvido de Ebbinghaus.',
    detail: '4 repasos · intervalos crecientes · sesiones cronometradas',
    primary: true,
  },
  {
    path: '/solo',
    icon: '⚡',
    label: 'Solo',
    tag: 'Práctica libre',
    headline: 'Puzzles sin estructura ni presión',
    body: 'Accede a cualquier puzzle de cualquier categoría y resuélvelo sin presión de tiempo ni registro de sesión. Útil cuando quieres explorar un bloque nuevo antes de comprometerte con un macrociclo, o simplemente practicar sin el cronómetro encima.',
    detail: 'Sin límite · todas las categorías · sin cronómetro obligatorio',
    primary: false,
  },
  {
    path: '/puzzles',
    icon: '📚',
    label: 'Puzzles',
    tag: 'Explorador',
    headline: 'Navega el banco completo',
    body: 'Vista completa de todos los puzzles disponibles organizados por categoría y dificultad. Desde aquí puedes ver el material que cubre cada categoría antes de arrancar un macrociclo.',
    detail: 'Filtros por categoría · vista previa de posiciones',
    primary: false,
  },
  {
    path: '/history',
    icon: '📋',
    label: 'Historial',
    tag: 'Seguimiento',
    headline: 'Tu progreso, sesión por sesión',
    body: 'Cada vez que terminas una sesión dentro de La Paloma, queda registrada: tiempo total, puzzles resueltos, errores y score. El historial te muestra si eres más rápido en el repaso 2 que en el 1 — esa es la métrica que importa.',
    detail: 'Score por sesión · comparativa entre repasos · tiempo promedio',
    primary: false,
  },
  {
    path: '/leaderboard',
    icon: '🏆',
    label: 'Ranking',
    tag: 'Global',
    headline: 'Compite con otros jugadores',
    body: 'Tabla de posiciones global por categoría. Se rankea por tiempo promedio por puzzle dentro de cada bloque. Una manera de calibrar si tu velocidad es competitiva.',
    detail: 'Rankings por categoría · tiempo por puzzle · actualización en tiempo real',
    primary: false,
  },
  {
    path: '/vision',
    icon: '👁️',
    label: 'Visión',
    tag: 'Complemento rápido',
    headline: 'Entrena el tablero en 30 segundos',
    body: 'Se muestra una coordenada y tienes que hacer clic en la casilla correcta lo más rápido posible. 30 segundos, máximos aciertos. Ideal como calentamiento antes de una sesión de puzzles.',
    detail: '30 segundos · máximas respuestas · ranking global',
    primary: false,
  },
  {
    path: '/blind',
    icon: '♟️',
    label: 'Ajedrez Ciego',
    tag: 'Avanzado',
    headline: 'Juega sin ver las piezas',
    body: 'Se te muestra la posición inicial y luego el tablero desaparece. Tienes que resolver el puzzle de memoria, introduciendo los movimientos sin referencia visual. El nivel más exigente de entrenamiento táctico.',
    detail: 'Memoria de posición · movimientos a ciegas · alta dificultad',
    primary: false,
  },
]

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [dark, setDark] = useState(true)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    const saved = localStorage.getItem('wp_theme')
    if (saved) setDark(saved === 'dark')
  }, [user, navigate])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('wp_theme', next ? 'dark' : 'light')
  }

  const t = dark ? {
    bg:    'bg-[#0A0A0F]',
    bg2:   'bg-[#12121A]',
    bg3:   'bg-[#1C1C28]',
    border:'border-[#252535]',
    borderLight: 'border-[#252535]',
    text:  'text-[#E8E6E0]',
    text2: 'text-[#B8B5AC]',
    text3: 'text-[#7A776E]',
  } : {
    bg:    'bg-[#F5F0E8]',
    bg2:   'bg-[#EDE8DF]',
    bg3:   'bg-[#E2DBD0]',
    border:'border-[#D4CABF]',
    borderLight: 'border-[#D4CABF]',
    text:  'text-[#1A1814]',
    text2: 'text-[#4A4640]',
    text3: 'text-[#8A8478]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'

  if (!user) return null

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300`}>

      {/* Nav */}
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>
                {user.nickname}
              </h1>
            </div>
            <button
              onClick={toggleTheme}
              className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}
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

      <div className="max-w-6xl mx-auto px-6">

        {/* Hero */}
        <div className="py-24 border-b" style={{ borderColor: dark ? '#252535' : '#D4CABF' }}>
          <p className={`text-xs uppercase tracking-[0.2em] ${t.text3} mb-5`}>Panel de inicio</p>
          <h2 className={`text-6xl font-bold ${t.text} mb-6 leading-none`} style={{ letterSpacing: '-0.03em' }}>
            ¿Por dónde<br />
            <span style={{ color: accentColor }}>empezamos hoy?</span>
          </h2>
          <p className={`text-lg ${t.text2} max-w-xl leading-relaxed`}>
            La Paloma es el método. Todo lo demás es un complemento. Si no sabes qué hacer, abre Ciclos y sigue donde lo dejaste.
          </p>
        </div>

        {/* Sección principal destacada */}
        <div className="py-20 border-b" style={{ borderColor: dark ? '#252535' : '#D4CABF' }}>
          <p className={`text-xs uppercase tracking-[0.2em] ${t.text3} mb-12`}>Método principal</p>
          <div
            className={`rounded-2xl ${t.bg2} border-2 p-10 cursor-pointer transition-all hover:scale-[1.005]`}
            style={{ borderColor: accentColor }}
            onClick={() => navigate('/cycles')}
          >
            <div className="flex items-start gap-6 mb-8">
              <span className="text-5xl">🕊️</span>
              <div>
                <span
                  className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
                >
                  {SECTIONS[0].tag}
                </span>
                <h3 className={`text-3xl font-bold ${t.text} mt-3 mb-1`} style={{ letterSpacing: '-0.02em' }}>
                  {SECTIONS[0].label}
                </h3>
                <p className={`text-sm ${t.text3}`}>{SECTIONS[0].headline}</p>
              </div>
            </div>
            {SECTIONS[0].body.split('\n\n').map((para, i) => (
              <p key={i} className={`text-base leading-relaxed ${t.text2} mb-4 max-w-3xl`}>{para}</p>
            ))}
            <div className="flex items-center justify-between mt-8 pt-8 border-t" style={{ borderColor: dark ? '#252535' : '#D4CABF' }}>
              <p className={`text-xs ${t.text3}`}>{SECTIONS[0].detail}</p>
              <button
                className="px-8 py-3 rounded-xl font-bold text-sm tracking-widest uppercase text-black transition-all hover:opacity-90 hover:scale-105"
                style={{ backgroundColor: accentColor }}
              >
                Abrir La Paloma →
              </button>
            </div>
          </div>
        </div>

        {/* Grid resto de secciones */}
        <div className="py-20">
          <p className={`text-xs uppercase tracking-[0.2em] ${t.text3} mb-12`}>Herramientas complementarias</p>
          <div className="grid md:grid-cols-2 gap-6">
            {SECTIONS.slice(1).map(s => (
              <div
                key={s.path}
                onClick={() => navigate(s.path)}
                className={`rounded-2xl ${t.bg2} border ${t.border} p-8 cursor-pointer transition-all hover:scale-[1.02] hover:border-opacity-80 flex flex-col`}
              >
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-3xl">{s.icon}</span>
                  <div>
                    <p className={`font-bold text-lg ${t.text}`} style={{ letterSpacing: '-0.01em' }}>{s.label}</p>
                    <p className={`text-xs ${t.text3} uppercase tracking-widest`}>{s.tag}</p>
                  </div>
                </div>
                <p className={`text-sm font-semibold mb-3`} style={{ color: accentColor }}>{s.headline}</p>
                <p className={`text-sm leading-relaxed ${t.text2} flex-1`}>{s.body}</p>
                <div className="flex items-center justify-between mt-6 pt-6 border-t" style={{ borderColor: dark ? '#252535' : '#D4CABF' }}>
                  <p className={`text-xs ${t.text3}`}>{s.detail}</p>
                  <span className={`text-xs font-bold ${t.text3}`}>→</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className={`border-t ${t.border} py-8 px-6 mt-8`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className={`text-xs ${t.text3}`}>🪃 Woodpecker · Método GM Axel Smith & Hans Tikkanen</span>
          <button
            onClick={() => { logout(); navigate('/') }}
            className={`text-xs ${t.text3} hover:${t.text} transition-colors`}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

    </div>
  )
}
