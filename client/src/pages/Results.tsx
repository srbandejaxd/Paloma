import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { RaceResult } from '../types'
import { formatTimeLong } from '../lib/time'

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const nickname = params.get('nickname') || ''

  const results: RaceResult[] = location.state?.results || []

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-slide-up">
        <div className="text-center mb-10">
          <p className="text-bone-3 font-mono text-xs uppercase tracking-widest mb-2">Carrera finalizada</p>
          <h2 className="text-4xl font-mono font-bold text-bone">Resultados</h2>
        </div>

        {/* Winner highlight */}
        {results[0] && (
          <div className="bg-amber/10 border border-amber/30 rounded-sm px-6 py-5 mb-4 text-center">
            <div className="text-3xl mb-1">🥇</div>
            <div className="text-2xl font-mono font-bold text-amber">{results[0].nickname}</div>
            <div className="text-bone-3 font-mono text-sm mt-1">
              {results[0].solved}/{results[0].totalPuzzles} · {formatTimeLong(results[0].totalTimeMs)} · {results[0].accuracy}% precisión
            </div>
          </div>
        )}

        {/* Full table */}
        <div className="bg-void-2 border border-void-4 rounded-sm overflow-hidden mb-6">
          <div className="grid grid-cols-12 px-4 py-2 border-b border-void-4">
            <span className="col-span-1 font-mono text-bone-3 text-xs uppercase tracking-widest">#</span>
            <span className="col-span-3 font-mono text-bone-3 text-xs uppercase tracking-widest">Jugador</span>
            <span className="col-span-2 font-mono text-bone-3 text-xs uppercase tracking-widest text-right">Puzzles</span>
            <span className="col-span-3 font-mono text-bone-3 text-xs uppercase tracking-widest text-right">Tiempo</span>
            <span className="col-span-2 font-mono text-bone-3 text-xs uppercase tracking-widest text-right">Errores</span>
            <span className="col-span-1 font-mono text-bone-3 text-xs uppercase tracking-widest text-right">%</span>
          </div>
          {results.map((r, i) => (
            <div
              key={r.nickname}
              className={`grid grid-cols-12 px-4 py-3 border-b border-void-4 last:border-0 items-center transition-all ${
                r.nickname === nickname ? 'bg-amber/5' : ''
              }`}
            >
              <span className="col-span-1 font-mono text-bone-3 text-sm">
                {i < 3 ? medals[i] : `${i + 1}`}
              </span>
              <span
                className={`col-span-3 font-mono text-sm font-semibold truncate ${
                  r.nickname === nickname ? 'text-amber' : 'text-bone'
                }`}
              >
                {r.nickname}
              </span>
              <span className="col-span-2 font-mono text-sm text-bone text-right">
                {r.solved}/{r.totalPuzzles}
              </span>
              <span className="col-span-3 font-mono text-sm text-bone text-right">
                {formatTimeLong(r.totalTimeMs)}
              </span>
              <span className="col-span-2 font-mono text-sm text-red-400 text-right">
                {r.errors}
              </span>
              <span
                className={`col-span-1 font-mono text-sm text-right ${
                  r.accuracy >= 90 ? 'text-green' : r.accuracy >= 70 ? 'text-amber' : 'text-red-400'
                }`}
              >
                {r.accuracy}%
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex-1 py-3 bg-void-3 text-bone font-mono text-sm tracking-widest uppercase border border-void-4 hover:border-bone-3 transition-colors rounded-sm"
          >
            Inicio
          </button>
          <button
            onClick={() => navigate(`/history?nickname=${encodeURIComponent(nickname)}`)}
            className="flex-1 py-3 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm"
          >
            Ver historial →
          </button>
        </div>
      </div>
    </div>
  )
}
