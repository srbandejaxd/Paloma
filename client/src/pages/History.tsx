import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBlocks, fetchAttempts } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Block, AttemptRecord } from '../types'
import { formatTimeLong } from '../lib/time'

export default function History() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetchBlocks().then(setBlocks).catch(console.error)
  }, [user, navigate])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    fetchAttempts(selectedBlock ?? undefined)
      .then(setAttempts)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, selectedBlock])

  const attemptsByBlock = attempts.reduce<Record<number, AttemptRecord[]>>((acc, a) => {
    if (!acc[a.blockId]) acc[a.blockId] = []
    acc[a.blockId].push(a)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-void">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <button onClick={() => navigate('/solo')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors mb-3 block">← Inicio</button>
            <h2 className="text-2xl font-mono font-bold text-bone">Historial</h2>
            <p className="text-bone-3 font-mono text-sm mt-1">
              <span className="text-amber">{user?.nickname}</span> — el tiempo baja, eso es el método
            </p>
          </div>
        </div>

        {/* Filtro por bloque */}
        <div className="flex gap-2 mb-8 flex-wrap">
          <button
            onClick={() => setSelectedBlock(null)}
            className={`px-4 py-2 font-mono text-xs border rounded-sm transition-all ${selectedBlock === null ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'}`}
          >
            Todos
          </button>
          {blocks.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBlock(b.id)}
              className={`px-3 py-2 font-mono text-xs border rounded-sm transition-all ${selectedBlock === b.id ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'}`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {loading && <p className="text-bone-3 font-mono text-sm animate-pulse-amber">Cargando...</p>}

        {!loading && attempts.length === 0 && (
          <div className="text-center py-16 border border-void-4 rounded-sm">
            <p className="text-bone-3 font-mono text-sm">Sin cycles registrados todavía</p>
            <button onClick={() => navigate('/solo')} className="mt-4 text-amber font-mono text-sm hover:underline">Iniciar primer cycle →</button>
          </div>
        )}

        {Object.entries(attemptsByBlock).map(([blockId, blockAttempts]) => {
          const block = blocks.find(b => b.id === parseInt(blockId))
          const sorted = [...blockAttempts].sort((a, b) => a.attemptNumber - b.attemptNumber)
          const completedCycles = sorted.filter(a => a.solved === a.totalPuzzles)
          const bestTime = completedCycles.length ? Math.min(...completedCycles.map(a => a.totalTimeMs)) : null
          const bestPpm = completedCycles.length ? Math.max(...completedCycles.map(a => a.ppm)) : null
          const totalCycles = sorted.length

          return (
            <div key={blockId} className="mb-10">
              {/* Block header */}
              <div className="flex items-end justify-between mb-4">
                <div>
                  <h3 className="font-mono text-base font-semibold text-bone">{block?.name || `Bloque ${blockId}`}</h3>
                  <p className="font-mono text-xs text-bone-3 mt-0.5">
                    {totalCycles} cycle{totalCycles !== 1 ? 's' : ''}
                    {completedCycles.length < totalCycles && (
                      <span className="ml-2 text-amber">{completedCycles.length} completados</span>
                    )}
                  </p>
                </div>
                <div className="text-right flex gap-6">
                  {bestTime && (
                    <div>
                      <div className="font-mono text-xs text-bone-3">mejor tiempo</div>
                      <div className="font-mono text-sm font-bold text-amber">{formatTimeLong(bestTime)}</div>
                    </div>
                  )}
                  {bestPpm && (
                    <div>
                      <div className="font-mono text-xs text-bone-3">mejor PPM</div>
                      <div className="font-mono text-sm font-bold text-amber">{bestPpm}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* PPM chart */}
              {sorted.length >= 2 && <PpmChart attempts={sorted} />}

              {/* Cycle list */}
              <div className="mt-3 space-y-1">
                {sorted.map((attempt, i) => {
                  const prev = i > 0 ? sorted[i - 1] : null
                  const isComplete = attempt.solved === attempt.totalPuzzles
                  const timeDiff = prev ? attempt.totalTimeMs - prev.totalTimeMs : null
                  const improved = timeDiff !== null && timeDiff < 0

                  return (
                    <div key={attempt.id} className="flex items-center gap-3 px-4 py-2.5 bg-void-2 border border-void-4 rounded-sm">
                      <span className="font-mono text-xs text-bone-3 w-20">Cycle {attempt.attemptNumber}</span>
                      <span className={`font-mono text-sm font-semibold flex-1 ${isComplete ? 'text-bone' : 'text-bone-3'}`}>
                        {formatTimeLong(attempt.totalTimeMs)}
                        {!isComplete && <span className="text-xs font-normal ml-1">({attempt.solved}/{attempt.totalPuzzles})</span>}
                      </span>
                      <span className="font-mono text-xs text-bone-3 w-16">{attempt.ppm} PPM</span>
                      <span className="font-mono text-xs text-bone-3 w-12">{attempt.errors} err</span>
                      <span className={`font-mono text-xs w-10 text-right ${attempt.accuracy >= 90 ? 'text-green-400' : attempt.accuracy >= 70 ? 'text-amber' : 'text-red-400'}`}>
                        {attempt.accuracy}%
                      </span>
                      {timeDiff !== null && (
                        <span className={`font-mono text-xs w-16 text-right ${improved ? 'text-green-400' : 'text-red-400'}`}>
                          {improved ? '↓' : '↑'}{formatTimeLong(Math.abs(timeDiff))}
                        </span>
                      )}
                      {timeDiff === null && <span className="w-16" />}
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

function PpmChart({ attempts }: { attempts: AttemptRecord[] }) {
  const ppms = attempts.map(a => a.ppm)
  const min = Math.min(...ppms)
  const max = Math.max(...ppms)
  const range = max - min || 1

  const W = 600
  const H = 64
  const PAD = 10

  const points = ppms.map((ppm, i) => ({
    x: PAD + (i / (ppms.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (ppm - min) / range) * (H - PAD * 2),
    ppm,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const fillD = `${pathD} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`

  return (
    <div className="bg-void-2 border border-void-4 rounded-sm overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex justify-between">
        <span className="font-mono text-xs text-bone-3 uppercase tracking-widest">PPM por cycle</span>
        <span className="font-mono text-xs text-amber">↑ más alto = más rápido</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <path d={fillD} fill="rgba(212,160,23,0.07)" />
        <path d={pathD} fill="none" stroke="#D4A017" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3"
            fill={i === points.length - 1 ? '#D4A017' : '#1C1C28'}
            stroke="#D4A017" strokeWidth="1.5"
          />
        ))}
      </svg>
      <div className="flex justify-between px-3 pb-2">
        <span className="font-mono text-xs text-bone-3">Cycle 1</span>
        <span className="font-mono text-xs text-bone-3">Más reciente</span>
      </div>
    </div>
  )
}
