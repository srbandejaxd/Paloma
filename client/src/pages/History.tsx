import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBlocks, fetchAttempts, fetchVisionHistory, VisionSession } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Block, AttemptRecord } from '../types'
import { formatTimeLong } from '../lib/time'

const CATEGORIES = [
  { id: 'woodpecker', label: 'Woodpecker' },
  { id: 'mate', label: 'Patrones de mate' },
  { id: 'woodpecker2', label: 'Woodpecker 2' },
]

export default function History() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('woodpecker')
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null)
  const [attempts, setAttempts] = useState<AttemptRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedCycle, setExpandedCycle] = useState<number | null>(null)
  const [visionMode, setVisionMode] = useState(false)
  const [visionSessions, setVisionSessions] = useState<VisionSession[]>([])

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

  useEffect(() => {
    if (!visionMode) return
    setLoading(true)
    fetchVisionHistory('coordinates')
      .then(setVisionSessions)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [visionMode])

  const blocksForCategory = blocks.filter(b => b.category === selectedCategory)
  const attemptsByBlock = attempts.reduce<Record<number, AttemptRecord[]>>((acc, a) => {
    const block = blocks.find(b => b.id === a.blockId)
    if (block?.category !== selectedCategory) return acc
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

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setVisionMode(false)} className={`px-4 py-2 font-mono text-xs border rounded-sm transition-all ${!visionMode ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'}`}>Puzzles</button>
          <button onClick={() => setVisionMode(true)} className={`px-4 py-2 font-mono text-xs border rounded-sm transition-all ${visionMode ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'}`}>Visión</button>
        </div>

        {!visionMode && (
          <>
            {/* Selector de categoría */}
            <div className="flex gap-2 mb-4">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(cat.id); setSelectedBlock(null) }}
                  className={`px-4 py-2 font-mono text-xs border rounded-sm transition-all ${selectedCategory === cat.id ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Selector de bloque */}
            <div className="flex gap-2 mb-8 flex-wrap">
              <button
                onClick={() => setSelectedBlock(null)}
                className={`px-4 py-2 font-mono text-xs border rounded-sm transition-all ${selectedBlock === null ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'}`}
              >
                Todos
              </button>
              {blocksForCategory.map(b => (
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

            {!loading && Object.keys(attemptsByBlock).length === 0 && (
              <div className="text-center py-16 border border-void-4 rounded-sm">
                <p className="text-bone-3 font-mono text-sm">Sin cycles registrados todavía</p>
                <button onClick={() => navigate('/solo')} className="mt-4 text-amber font-mono text-sm hover:underline">Iniciar primer cycle →</button>
              </div>
            )}

            {Object.entries(attemptsByBlock).map(([blockId, blockAttempts]) => {
              const block = blocks.find(b => b.id === parseInt(blockId))
              const sorted = [...blockAttempts].sort((a, b) => a.attemptNumber - b.attemptNumber)
              const bestScore = sorted.length ? Math.max(...sorted.map(a => a.score)) : null
              const bestTime = sorted.length ? Math.min(...sorted.map(a => a.totalTimeMs)) : null
              const totalCycles = sorted.length

              return (
                <div key={blockId} className="mb-10">
                  <div className="flex items-end justify-between mb-4">
                    <div>
                      <h3 className="font-mono text-base font-semibold text-bone">{block?.name || `Bloque ${blockId}`}</h3>
                      <p className="font-mono text-xs text-bone-3 mt-0.5">{totalCycles} cycle{totalCycles !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right flex gap-6">
                      {bestScore !== null && (
                        <div>
                          <div className="font-mono text-xs text-bone-3">mejor score</div>
                          <div className="font-mono text-sm font-bold text-amber">{bestScore.toLocaleString()} pts</div>
                        </div>
                      )}
                      {bestTime !== null && (
                        <div>
                          <div className="font-mono text-xs text-bone-3">mejor tiempo</div>
                          <div className="font-mono text-sm font-bold text-amber">{formatTimeLong(bestTime)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {sorted.length >= 2 && <ScoreChart attempts={sorted} />}

                  <div className="mt-3 space-y-1">
                    {sorted.map((attempt, i) => {
                      const prev = i > 0 ? sorted[i - 1] : null
                      const timeDiff = prev ? attempt.totalTimeMs - prev.totalTimeMs : null
                      const improved = timeDiff !== null && timeDiff < 0

                      return (
                        <div key={attempt.id}>
                          <div
                            onClick={() => setExpandedCycle(expandedCycle === attempt.id ? null : attempt.id)}
                            className="flex items-center gap-3 px-4 py-2.5 bg-void-2 border border-void-4 rounded-sm cursor-pointer hover:border-bone-3 transition-colors"
                          >
                            <span className="font-mono text-xs text-bone-3 w-20">Cycle {attempt.attemptNumber}</span>
                            <span className="font-mono text-xs text-bone-3 w-24">
                              {new Date(attempt.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className="font-mono text-sm font-semibold w-24 text-bone">
                              {formatTimeLong(attempt.totalTimeMs)}
                            </span>
                            <span className="font-mono text-sm font-bold text-amber flex-1">
                              {attempt.score.toLocaleString()} pts
                            </span>
                            <span className="font-mono text-xs text-bone-3 w-12">{attempt.errors} err</span>
                            {timeDiff !== null && (
                              <span className={`font-mono text-xs w-16 text-right ${improved ? 'text-green-400' : 'text-red-400'}`}>
                                {improved ? '↓' : '↑'}{formatTimeLong(Math.abs(timeDiff))}
                              </span>
                            )}
                            {timeDiff === null && <span className="w-16" />}
                            <span className="font-mono text-xs text-bone-3 w-4 text-right">
                              {expandedCycle === attempt.id ? '▲' : '▼'}
                            </span>
                          </div>
                          {expandedCycle === attempt.id && (
                            <div className="border border-t-0 border-void-4 bg-void rounded-b-sm px-4 py-3">
                              {!attempt.failedPuzzles || attempt.failedPuzzles.length === 0 ? (
                                <p className="font-mono text-xs text-green-400">✓ Sin errores en este cycle</p>
                              ) : (
                                <div className="space-y-1.5">
                                  <p className="font-mono text-xs text-red-400 uppercase tracking-widest mb-2">✗ Puzzles con errores ({attempt.failedPuzzles.length})</p>
                                  {attempt.failedPuzzles.map((fp, fi) => (
                                    <div key={fi} className="flex items-center justify-between">
                                      <span className="font-mono text-sm text-bone">Puzzle #{fp.orderInBlock} del bloque</span>
                                      <span className="font-mono text-xs text-red-400">{fp.errors} error{fp.errors !== 1 ? 'es' : ''}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {visionMode && (
          <div className="space-y-2">
            {loading && <p className="text-bone-3 font-mono text-sm animate-pulse-amber">Cargando...</p>}
            {!loading && visionSessions.length === 0 && (
              <div className="text-center py-16 border border-void-4 rounded-sm">
                <p className="text-bone-3 font-mono text-sm">Sin sesiones de visión todavía</p>
              </div>
            )}
            {!loading && visionSessions.map((s, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 bg-void-2 border border-void-4 rounded-sm font-mono text-sm">
                <span className="text-bone-3 text-xs w-32">
                  {new Date(s.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-green-400 font-bold">{s.score} correctas</span>
                <span className="text-red-400 text-xs">{s.errors} errores</span>
                <span className="text-bone-3 text-xs ml-auto">
                  {s.score + s.errors > 0 ? Math.round(s.score / (s.score + s.errors) * 100) : 0}% precisión
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreChart({ attempts }: { attempts: AttemptRecord[] }) {
  const scores = attempts.map(a => a.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min || 1

  const W = 600
  const H = 64
  const PAD = 10

  const points = scores.map((score, i) => ({
    x: PAD + (i / (scores.length - 1)) * (W - PAD * 2),
    y: PAD + (1 - (score - min) / range) * (H - PAD * 2),
    score,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const fillD = `${pathD} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`

  return (
    <div className="bg-void-2 border border-void-4 rounded-sm overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex justify-between">
        <span className="font-mono text-xs text-bone-3 uppercase tracking-widest">Score por cycle</span>
        <span className="font-mono text-xs text-amber">↑ más alto = mejor</span>
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
