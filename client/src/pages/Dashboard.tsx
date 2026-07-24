import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const SECTIONS = [
  {
    path: '/cycles',
    icon: '🕊️',
    label: 'La Paloma',
    tag: 'Método principal',
    tagColor: '#D4A017',
    headline: 'El núcleo de tu entrenamiento',
    body: 'Aquí es donde ocurre el trabajo real. Crea un macrociclo para una categoría de puzzles y el sistema te guía a través de 4 repasos del mismo material. Cada repaso recorre los mismos ejercicios desde el principio — el objetivo no es ver más puzzles, sino resolver los mismos en menos tiempo. La Paloma aplica repetición espaciada inversa: el primer repaso es el más largo, el último el más corto. Exactamente lo contrario al método Woodpecker original, y fundamentado en la curva del olvido de Ebbinghaus.',
    detail: '4 repasos · intervalos crecientes · sesiones cronometradas',
    primary: true,
  },
  {
    path: '/solo',
    icon: '⚡',
    label: 'Solo',
    tag: 'Práctica libre',
    tagColor: null,
    headline: 'Puzzles sin estructura',
    body: 'Accede a cualquier puzzle de cualquier categoría y resuélvelo sin presión de tiempo ni registro de sesión. Útil cuando quieres explorar un bloque nuevo antes de comprometerte con un macrociclo, o cuando quieres repasar piezas específicas por tu cuenta.',
    detail: 'Sin límite · sin cronómetro obligatorio · todas las categorías',
    primary: false,
  },
  {
    path: '/puzzles',
    icon: '📚',
    label: 'Puzzles',
    tag: 'Explorador',
    tagColor: null,
    headline: 'Navega el banco completo',
    body: 'Vista completa de todos los puzzles disponibles organizados por categoría y dificultad. Desde aquí puedes ver el material que cubre cada categoría antes de arrancar un macrociclo, o buscar puzzles específicos por posición o tema táctico.',
    detail: 'Filtros por categoría · vista previa de posiciones',
    primary: false,
  },
  {
    path: '/history',
    icon: '📈',
    label: 'Historial',
    tag: 'Seguimiento',
    tagColor: null,
    headline: 'Tu progreso, sesión por sesión',
    body: 'Cada vez que terminas una sesión dentro de La Paloma, queda registrada: tiempo total, puzzles resueltos, errores cometidos y score ponderado. El historial te muestra si eres más rápido en el repaso 2 que en el 1 — esa es la métrica que importa. Si no mejoras entre repasos, el método te lo dice sin ambigüedades.',
    detail: 'Score por sesión · comparativa entre repasos · tiempo promedio',
    primary: false,
  },
  {
    path: '/leaderboard',
    icon: '🏆',
    label: 'Ranking',
    tag: 'Global',
    tagColor: null,
    headline: 'Compite con otros jugadores',
    body: 'Tabla de posiciones global por categoría. Se rankea por tiempo promedio por puzzle dentro de cada bloque. Una manera de calibrar si tu velocidad de solución es competitiva y de mantener la motivación cuando el entrenamiento en solitario se siente monótono.',
    detail: 'Rankings por categoría · tiempo por puzzle · actualización en tiempo real',
    primary: false,
  },
  {
    path: '/vision',
    icon: '👁️',
    label: 'Visión',
    tag: 'Complemento rápido',
    tagColor: null,
    headline: 'Entrena el tablero en 30 segundos',
    body: 'Se muestra una coordenada del tablero y tienes que hacer clic en la casilla correcta lo más rápido posible. 30 segundos, máximos aciertos. Entrena la visión espacial del tablero y la automatización de las coordenadas — un complemento rápido para el calentamiento antes de una sesión de puzzles.',
    detail: '30 segundos · máximas respuestas · ranking global',
    primary: false,
  },
  {
    path: '/blind',
    icon: '♟️',
    label: 'Ajedrez Ciego',
    tag: 'Avanzado',
    tagColor: null,
    headline: 'Juega sin ver las piezas',
    body: 'Se te muestra la posición inicial y luego el tablero desaparece. Tienes que resolver el puzzle de memoria, introduciendo los movimientos sin referencia visual. El nivel más exigente de entrenamiento táctico — requiere que hayas automatizado bien los patrones básicos antes de intentarlo.',
    detail: 'Memoria de posición · movimientos a ciegas · alta dificultad',
    primary: false,
  },
]

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
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
    bg: 'bg-[#0A0A0F]',
    bg2: 'bg-[#12121A]',
    bg3: 'bg-[#1C1C28]',
    border: 'border-[#252535]',
    text: 'text-[#E8E6E0]',
    text2: 'text-[#B8B5AC]',
    text3: 'text-[#7A776E]',
    inputBg: 'bg-[#12121A]',
    toggleBg: 'bg-[#1C1C28] border-[#252535] text-[#7A776E] hover:text-[#E8E6E0]',
  } : {
    bg: 'bg-[#F5F0E8]',
    bg2: 'bg-[#EDE8DF]',
    bg3: 'bg-[#E2DBD0]',
    border: 'border-[#D4CABF]',
    text: 'text-[#1A1814]',
    text2: 'text-[#4A4640]',
    text3: 'text-[#8A8478]',
    inputBg: 'bg-[#EDE8DF]',
    toggleBg: 'bg-[#E2DBD0] border-[#D4CABF] text-[#8A8478] hover:text-[#1A1814]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'

  if (!user) return null

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300`}>

      {/* Nav */}
      <nav className={`fixed top-0 left-0 right-0 z-50 ${t.bg} border-b ${t.border}`} style={{ backgroundColor: dark ? '#0A0A0F' : '#F5F0E8' }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">🪃</span>
            <span className={`font-bold text-sm tracking-widest uppercase ${t.text}`}>Woodpecker</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${t.text3}`}>{user.nickname}</span>
            <button
              onClick={toggleTheme}
              className={`p-2 border rounded-sm transition-all ${t.toggleBg} ${t.border}`}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              onClick={() => { logout(); navigate('/') }}
              className={`px-3 py-1.5 rounded-sm border text-xs ${t.text3} ${t.border} hover:${t.text} transition-colors`}
            >
              Salir
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20">

        {/* Header */}
        <div className="mb-16">
          <p className={`text-xs uppercase tracking-[0.2em] ${t.text3} mb-3`}>Bienvenido</p>
          <h1 className={`text-5xl font-bold ${t.text} mb-4`} style={{ letterSpacing: '-0.025em' }}>
            Hola, <span style={{ color: accentColor }}>{user.nickname}</span>
          </h1>
          <p className={`text-base ${t.text2} max-w-xl leading-relaxed`}>
            Aquí está todo lo que tienes disponible. Empieza por La Paloma si quieres seguir el método — el resto son complementos.
          </p>
        </div>

        {/* Sección principal destacada */}
        <div
          className={`rounded-xl ${t.bg2} border p-8 mb-4 cursor-pointer transition-all hover:scale-[1.01]`}
          style={{ borderColor: accentColor, borderWidth: '1.5px' }}
          onClick={() => navigate(SECTIONS[0].path)}
        >
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{SECTIONS[0].icon}</span>
                <div>
                  <span
                    className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm"
                    style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
                  >
                    {SECTIONS[0].tag}
                  </span>
                </div>
              </div>
              <h2 className={`text-2xl font-bold ${t.text} mb-1`} style={{ letterSpacing: '-0.02em' }}>
                {SECTIONS[0].label}
              </h2>
              <p className={`text-sm font-semibold mb-3 ${t.text3}`}>{SECTIONS[0].headline}</p>
              <p className={`text-sm leading-relaxed ${t.text2} max-w-2xl`}>{SECTIONS[0].body}</p>
              <p className={`text-xs mt-4 ${t.text3}`}>{SECTIONS[0].detail}</p>
            </div>
            <div className="flex-shrink-0 self-center">
              <button
                className="px-6 py-3 rounded-lg font-bold text-sm tracking-widest uppercase text-black transition-all hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                Ir a La Paloma →
              </button>
            </div>
          </div>
        </div>

        {/* Grid del resto */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {SECTIONS.slice(1).map(s => (
            <div
              key={s.path}
              onClick={() => navigate(s.path)}
              className={`rounded-xl ${t.bg2} border ${t.border} p-6 cursor-pointer transition-all hover:border-opacity-60 hover:scale-[1.01] flex flex-col`}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <p className={`font-bold text-sm ${t.text}`}>{s.label}</p>
                  <p className={`text-xs ${t.text3}`}>{s.tag}</p>
                </div>
              </div>
              <p className={`text-xs font-semibold mb-2`} style={{ color: accentColor }}>{s.headline}</p>
              <p className={`text-xs leading-relaxed ${t.text2} flex-1`}>{s.body}</p>
              <p className={`text-xs mt-4 pt-4 border-t ${t.border} ${t.text3}`}>{s.detail}</p>
            </div>
          ))}
        </div>

      </div>

      {/* Footer */}
      <div className={`border-t ${t.border} py-6 px-6`}>
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
