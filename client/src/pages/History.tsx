import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchBlocks, fetchAttempts } from '../lib/api'
import { Block, AttemptRecord } from '../types'
import { formatTimeLong, improvementPct } from '../lib/time'

export default function History() {
  const [searchParams] = useSearchParams()
  const nickname = searchParams.get('nickname') || ''
  const navigate = useNavigate()

  const [inputNick, setInputNick] = useState(nickname)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchBlocks().then(setBlocks).catch(console.error)
  }, [])

  useEffect(() => {
    if (!inputNick) return
    setLoading(true)
    fetchAttempts(inputNick, selectedBlock ?? undefined)
      .then(setAttempts)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [inputNick, selectedBlock])

  // Group attempts by block
  const attemptsByBlock = attempts.reduce<Record<number, AttemptRecord[]>>((acc, a) => {
    const blockId = a.blockId
    if (blockId == null) return acc
    
    if (!acc[blockId]) acc[blockId] = []
    acc[blockId].push(a)
  
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-void">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-bone-3 font-mono text-xs hover:text-bone transition-colors mb-3 block"
            >
              ← Inicio
            </button>
            <h2 className="text-2xl font-mono font-bold text-bone">Historial</h2>
            <p className="text-bone-3 font-mono text-sm mt-1">
              El tiempo disminuye. Eso es el método.
            </p>
          </div>
        </div>

        {/* Nickname input */}
        <div className="flex gap-3 mb-8">
          <input
            type="text"
            value={inputNick}
            onChange={e => setInputNick(e.target.value)}
            placeholder="Tu nickname..."
            className="flex-1 bg-void-2 border border-void-4 text-bone font-mono text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-amber transition-colors placeholder:text-bone-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedBlock(null)}
              className={`px-4 py-2 font-mono text-xs border rounded-sm transition-all ${
                selectedBlock === null
                  ? 'border-amber bg-amber/10 text-amber'
                  : 'border-void-4 text-bone-3 hover:border-bone-3'
              }`}
            >
              Todos
            </button>
            {blocks.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBlock(b.id)}
                className={`px-3 py-2 font-mono text-xs border rounded-sm transition-all ${
                  selectedBlock === b.id
                    ? 'border-amber bg-amber/10 text-amber'
                    : 'border-void-4 text-bone-3 hover:border-bone-3'
                }`}
              >
                B{b.id}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <p className="text-bone-3 font-mono text-sm animate-pulse-amber">Cargando...</p>
        )}

        {!loading && inputNick && attempts.length === 0 && (
          <div className="text-center py-16 border border-void-4 rounded-sm">
            <p className="text-bone-3 font-mono text-sm">
              Sin intentos registrados para <span className="text-amber">{inputNick}</span>
            </p>
          </div>
        )}

        {/* Blocks with attempts */}
        {Object.entries(attemptsByBlock).map(([blockId, blockAttempts]) => {
          const block = blocks.find(b => b.id === parseInt(blockId))
          const sorted = [...blockAttempts].sort((a, b) => a.attemptNumber - b.attemptNumber)
          const best = Math.min(...sorted.map(a => a.totalTimeMs))
          const latest = sorted[sorted.length - 1]
          const first = sorted[0]
          const totalImprovement = improvementPct(first.totalTimeMs, latest.totalTimeMs)

          return (
            <div key={blockId} className="mb-8">
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h3 className="font-mono text-base font-semibold text-bone">
                    {block?.name || `Bloque ${blockId}`}
                  </h3>
                  <p className="font-mono text-xs text-bone-3 mt-0.5">
                    {sorted.length} intento{sorted.length !== 1 ? 's' : ''}
                    {totalImprovement > 0 && (
                      <span className="text-green ml-2">
                        ↓ {totalImprovement}% más rápido
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs text-bone-3">mejor tiempo</div>
                  <div className="font-mono text-sm font-bold text-amber">{formatTimeLong(best)}</div>
                </div>
              </div>

              {/* Speed curve — the signature element */}
              <SpeedCurve attempts={sorted} />

              {/* Attempt list */}
              <div className="mt-3 space-y-1">
                {sorted.map((attempt, i) => {
                  const prevTime = i > 0 ? sorted[i - 1].totalTimeMs : null
                  const improved = prevTime && attempt.totalTimeMs < prevTime
                  const pct = prevTime ? improvementPct(prevTime, attempt.totalTimeMs) : null

                  return (
                    <div
                      key={attempt.id}
                      className="flex items-center gap-4 px-4 py-2.5 bg-void-2 border border-void-4 rounded-sm"
                    >
                      <span className="font-mono text-xs text-bone-3 w-16">
                        #{attempt.attemptNumber}
                      </span>
                      <span className="font-mono text-sm font-semibold text-bone flex-1">
                        {formatTimeLong(attempt.totalTimeMs)}
                      </span>
                      <span className="font-mono text-xs text-bone-3">
                        {attempt.solved}/{attempt.totalPuzzles}
                      </span>
                      <span className="font-mono text-xs text-bone-3">
                        {attempt.errors} err
                      </span>
                      <span
                        className={`font-mono text-xs w-16 text-right ${
                          attempt.accuracy >= 90
                            ? 'text-green'
                            : attempt.accuracy >= 70
                            ? 'text-amber'
                            : 'text-red-400'
                        }`}
                      >
                        {attempt.accuracy}%
                      </span>
                      {pct !== null && pct > 0 && (
                        <span className="font-mono text-xs text-green w-14 text-right">
                          ↓{pct}%
                        </span>
                      )}
                      {pct !== null && pct <= 0 && (
                        <span className="font-mono text-xs text-red-400 w-14 text-right">
                          ↑{Math.abs(pct)}%
                        </span>
                      )}
                      {pct === null && <span className="w-14" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// The signature visual: speed improvement as an SVG spark line
function SpeedCurve({ attempts }: { attempts: AttemptRecord[] }) {
  if (attempts.length < 2) return null

  const times = attempts.map(a => a.totalTimeMs)
  const min = Math.min(...times)
  const max = Math.max(...times)
  const range = max - min || 1

  const W = 600
  const H = 56
  const PAD = 8

  const points = times.map((t, i) => {
    const x = PAD + (i / (times.length - 1)) * (W - PAD * 2)
    // Invert: lower time = higher on chart (better)
    const y = PAD + ((t - min) / range) * (H - PAD * 2)
    return { x, y, t }
  })

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  // Fill path
  const fillD = `${pathD} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`

  return (
    <div className="bg-void-2 border border-void-4 rounded-sm overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        {/* Fill */}
        <path d={fillD} fill="rgba(212,160,23,0.06)" />
        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#D4A017"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill={i === points.length - 1 ? '#D4A017' : '#1C1C28'}
            stroke="#D4A017"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <div className="flex justify-between px-2 pb-2">
        <span className="font-mono text-xs text-bone-3">Intento 1</span>
        <span className="font-mono text-xs text-bone-3">Más reciente</span>
      </div>
    </div>
  )
}
