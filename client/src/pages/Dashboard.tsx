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
  { path: '/openings',    label: 'Aperturas', icon: '♟'  },
]

const TOOLS = [
  {
    path: '/solo',
    icon: '⚡',
    label: 'Solo',
    sub: 'Práctica libre',
    desc: 'Entrena patrones tácticos y de mate por libro y bloque. Hay presión de tiempo y tus marcas quedan registradas en el historial. Ideal para trabajar patrones específicos fuera del ciclo principal.',
  },
  {
    path: '/puzzles',
    icon: '📚',
    label: 'Puzzles',
    sub: 'Explorador',
    desc: 'Navega el banco completo de puzzles. Ve el material de cada categoría, filtra por dificultad y elige qué quieres trabajar.',
  },
  {
    path: '/history',
    icon: '📋',
    label: 'Historial',
    sub: 'Seguimiento',
    desc: 'Registra tus sesiones de Solo y Visión: tiempo, aciertos y marcas personales. El progreso de La Paloma tiene su propio seguimiento dentro de Ciclos.',
  },
  {
    path: '/leaderboard',
    icon: '🏆',
    label: 'Ranking',
    sub: 'Competencia',
    desc: 'Tabla global por categoría. Rankea por tiempo promedio por puzzle. Úsala para calibrar si tu nivel es competitivo.',
  },
  {
    path: '/vision',
    icon: '👁️',
    label: 'Visión',
    sub: 'Calentamiento · 30 seg',
    desc: 'Identifica coordenadas del tablero a velocidad máxima. Treinta segundos, máximos aciertos. Perfecto antes de una sesión de puzzles.',
  },
  {
    path: '/blind',
    icon: '♟️',
    label: 'Ajedrez Ciego',
    sub: 'Nivel avanzado',
    desc: 'Ves la posición inicial y el tablero desaparece. Resuelves de memoria. El entrenamiento táctico más exigente de la plataforma.',
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
    bg: 'bg-[#0A0A0F]', bg2: 'bg-[#12121A]', bg3: 'bg-[#1C1C28]',
    border: 'border-[#252535]', borderRaw: '#252535',
    text: 'text-[#E8E6E0]', text2: 'text-[#B8B5AC]', text3: 'text-[#7A776E]',
  } : {
    bg: 'bg-[#F5F0E8]', bg2: 'bg-[#EDE8DF]', bg3: 'bg-[#E2DBD0]',
    border: 'border-[#D4CABF]', borderRaw: '#D4CABF',
    text: 'text-[#1A1814]', text2: 'text-[#4A4640]', text3: 'text-[#8A8478]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'

  if (!user) return null

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300`}>

      {/* Nav */}
      <nav className={`sticky top-0 z-50 ${t.bg2} border-b ${t.border} backdrop-blur-xl transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user.nickname}</h1>
            </div>
            <button onClick={toggleTheme} className={`w-10 h-10 rounded-lg ${t.bg3} border ${t.border} flex items-center justify-center ${t.text3} hover:${t.text} transition-all`}>
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
          <div className="flex items-center overflow-x-auto pb-1">
            {NAV_ITEMS.map((item, idx) => {
              const isActive = location.pathname === item.path
              return (
                <div key={item.path} className="flex items-center flex-shrink-0">
                  <button
                    onClick={() => navigate(item.path)}
                    className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all relative group ${isActive ? t.text : `${t.text2} hover:${t.text}`}`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="whitespace-nowrap">{item.label}</span>
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} style={{ backgroundColor: accentColor }} />
                  </button>
                  {idx < NAV_ITEMS.length - 1 && <div className="w-px h-4 mx-0.5" style={{ backgroundColor: t.borderRaw }} />}
                </div>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-28 pb-28">
        <p className={`text-xs uppercase tracking-[0.25em] ${t.text3} mb-6`}>Panel de inicio</p>
        <h2 className={`text-7xl font-bold ${t.text} leading-none mb-8`} style={{ letterSpacing: '-0.035em' }}>
          ¿Por dónde<br />
          <span style={{ color: accentColor }}>empezamos?</span>
        </h2>
        <p className={`text-xl ${t.text2} max-w-lg leading-relaxed`}>
          La Paloma es el método central. El resto son herramientas complementarias para cuando no estás en sesión.
        </p>
      </section>

      <div style={{ borderTop: `1px solid ${t.borderRaw}` }} />

      {/* Método principal */}
      <section className="max-w-7xl mx-auto px-6 py-28">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <div>
            <p className={`text-xs uppercase tracking-[0.25em] ${t.text3} mb-6`}>Método principal</p>
            <div className="flex items-center gap-4 mb-8">
              <span className="text-5xl">🕊️</span>
              <div>
                <h3 className={`text-4xl font-bold ${t.text}`} style={{ letterSpacing: '-0.025em' }}>La Paloma</h3>
                <p style={{ color: accentColor }} className="text-sm font-semibold mt-1">Ciclos de repetición espaciada</p>
              </div>
            </div>
            <p className={`text-base leading-loose ${t.text2} mb-6`}>
              Crea un macrociclo para una categoría y el sistema te guía por 4 repasos del mismo material. Cada repaso recorre los mismos ejercicios desde el principio. El objetivo no es ver más puzzles — es resolver los mismos en menos tiempo cada vez.
            </p>
            <p className={`text-base leading-loose ${t.text2} mb-10`}>
              Los descansos son crecientes: el primer descanso dura menos, el último mas. Fundamentado en la curva del olvido de Ebbinghaus — exactamente lo contrario al Woodpecker original.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={() => navigate('/cycles')}
                className="px-8 py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-black transition-all hover:opacity-90 hover:scale-105"
                style={{ backgroundColor: accentColor }}
              >
                Abrir La Paloma →
              </button>
              <p className={`text-xs ${t.text3}`}>4 repasos · sesiones cronometradas · intervalos crecientes</p>
            </div>
          </div>

          {/* Tabla de repasos */}
          <div className={`rounded-2xl ${t.bg2} border ${t.border} overflow-hidden`}>
            <div className="px-8 py-6 border-b" style={{ borderColor: t.borderRaw }}>
              <p className={`text-xs uppercase tracking-widest ${t.text3}`}>Estructura de repasos</p>
            </div>
            {[
              { n: '01', days: '10 días', rest: '1 día de descanso', label: 'Primera exposición' },
              { n: '02', days: '7 días',  rest: '3 días de descanso', label: 'Consolidación inicial' },
              { n: '03', days: '4 días',  rest: '5 días de descanso', label: 'Refuerzo profundo' },
              { n: '04', days: '1 día',   rest: '7 días de descanso', label: 'Verificación final' },
            ].map((row, i) => (
              <div key={i} className={`flex items-center gap-6 px-8 py-5 border-b last:border-0`} style={{ borderColor: t.borderRaw }}>
                <span className="text-2xl font-bold w-8" style={{ color: accentColor }}>{row.n}</span>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${t.text}`}>{row.label}</p>
                  <p className={`text-xs ${t.text3} mt-0.5`}>{row.rest}</p>
                </div>
                <span className={`text-sm font-mono font-bold ${t.text2}`}>{row.days}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${t.borderRaw}` }} />

      {/* Herramientas complementarias */}
      <section className="max-w-7xl mx-auto px-6 py-28">
        <p className={`text-xs uppercase tracking-[0.25em] ${t.text3} mb-20`}>Herramientas complementarias</p>

        {TOOLS.map((tool, i) => (
          <div key={tool.path}>
            <div
              className="grid lg:grid-cols-3 gap-8 py-12 cursor-pointer group"
              onClick={() => navigate(tool.path)}
            >
              <div className="flex items-center gap-5">
                <span className="text-4xl">{tool.icon}</span>
                <div>
                  <p className={`text-xl font-bold ${t.text} group-hover:underline`} style={{ letterSpacing: '-0.01em' }}>{tool.label}</p>
                  <p className={`text-xs uppercase tracking-widest mt-1`} style={{ color: accentColor }}>{tool.sub}</p>
                </div>
              </div>
              <div className="lg:col-span-2 flex items-center justify-between gap-8">
                <p className={`text-sm leading-loose ${t.text2} max-w-xl`}>{tool.desc}</p>
                <span className={`text-2xl ${t.text3} group-hover:${t.text} transition-all group-hover:translate-x-1 flex-shrink-0`}>→</span>
              </div>
            </div>
            {i < TOOLS.length - 1 && <div style={{ borderTop: `1px solid ${t.borderRaw}` }} />}
          </div>
        ))}
      </section>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${t.borderRaw}` }}>
        <div className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
          <span className={`text-xs ${t.text3}`}>🪃 Woodpecker · GM Axel Smith & Hans Tikkanen</span>
          <button onClick={() => { logout(); navigate('/') }} className={`text-xs ${t.text3} hover:${t.text} transition-colors`}>
            Cerrar sesión
          </button>
        </div>
      </div>

    </div>
  )
}
