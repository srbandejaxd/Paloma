import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBlocks, fetchLeaderboard, LeaderboardEntry } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Block } from '../types'
import { formatTimeLong } from '../lib/time'

export default function Leaderboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null)
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetchBlocks().then(b => {
      setBlocks(b)
      if (b.length > 0) setSelectedBlock(b[0].id)
    }).catch(console.error)
  }, [user, navigate])

  useEffect(() => {
    if (selectedBlock === null) return
    setLoading(true)
    fetchLeaderboard(selectedBlock)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedBlock])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen bg-void">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/solo')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors mb-6 block">← Inicio</button>

        <div className="mb-8">
          <h2 className="text-2xl font-mono font-bold text-bone">Ranking</h2>
          <p className="text-bone-3 font-mono text-sm mt-1">Mejor score por bloque — solo cycles completados</p>
        </div>

        {/* Block selector */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {blocks.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBlock(b.id)}
              className={`px-4 py-2 font-mono text-xs border rounded-sm transition-all ${selectedBlock === b.id ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'}`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {loading && <p className="text-bone-3 font-mono text-sm animate-pulse-amber">Cargando...</p>}

        {!loading && entries.length === 0 && (
          <div className="text-center py-16 border border-void-4 rounded-sm">
            <p className="text-bone-3 font-mono text-sm">Nadie ha completado este bloque todavía</p>
            <p className="text-bone-3 font-mono text-xs mt-2">¡Sé el primero!</p>
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-2 font-mono text-xs text-bone-3 uppercase tracking-widest">
              <span className="w-8">#</span>
              <span className="flex-1">Jugador</span>
              <span className="w-28 text-right">Score</span>
              <span className="w-24 text-right">Mejor tiempo</span>
              <span className="w-16 text-right">Cycles</span>
            </div>

            {entries.map((entry, i) => (
              <div
                key={entry.nickname}
                className={`flex items-center gap-3 px-4 py-3 border rounded-sm transition-all ${
                  entry.nickname === user?.nickname
                    ? 'border-amber/40 bg-amber/5'
                    : 'border-void-4 bg-void-2'
                }`}
              >
                <span className="w-8 font-mono text-sm text-bone-3">
                  {i < 3 ? medals[i] : `${i + 1}`}
                </span>
                <span className={`flex-1 font-mono text-sm font-bold ${entry.nickname === user?.nickname ? 'text-amber' : 'text-bone'}`}>
                  {entry.nickname}
                  {entry.nickname === user?.nickname && <span className="text-xs font-normal ml-2 text-bone-3">(tú)</span>}
                </span>
                <span className="w-28 font-mono text-sm font-bold text-amber text-right">{entry.bestScore.toLocaleString()} pts</span>
                <span className="w-24 font-mono text-sm text-bone text-right">{formatTimeLong(entry.bestTimeMs)}</span>
                <span className="w-16 font-mono text-xs text-bone-3 text-right">{entry.totalCycles}x</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
