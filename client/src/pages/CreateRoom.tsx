import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAllPuzzles } from '../lib/api'
import { getSocket } from '../lib/socket'
import { Puzzle } from '../types'

type SelectionMode = 'manual' | 'random'

export default function CreateRoom() {
  const [params] = useSearchParams()
  const nickname = params.get('nickname') || 'Anon'
  const navigate = useNavigate()

  const [allPuzzles, setAllPuzzles] = useState<Puzzle[]>([])
  const [loadingPuzzles, setLoadingPuzzles] = useState(true)

  // Tiempo libre
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false)
  const [timeLimitInput, setTimeLimitInput] = useState('10') // minutos

  // Selección de puzzles
  const [mode, setMode] = useState<SelectionMode>('random')
  const [randomCount, setRandomCount] = useState('20')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [filterBlock, setFilterBlock] = useState<string>('all')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAllPuzzles()
      .then(setAllPuzzles)
      .catch(() => setError('No se pudieron cargar los puzzles'))
      .finally(() => setLoadingPuzzles(false))
  }, [])

  // Bloques únicos para el filtro
  const blockNames = Array.from(
    new Map(allPuzzles.map(p => [p.blockId, p.blockName ?? `Bloque ${p.blockId}`])).entries()
  )

  const visiblePuzzles =
    filterBlock === 'all'
      ? allPuzzles
      : allPuzzles.filter(p => String(p.blockId) === filterBlock)

  function togglePuzzle(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(visiblePuzzles.map(p => p.id)))
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }

  function handleCreate() {
    setError('')

    // Armar lista de puzzleIds
    let puzzleIds: number[]
    if (mode === 'manual') {
      puzzleIds = [...selectedIds]
      if (puzzleIds.length === 0) {
        setError('Selecciona al menos un puzzle')
        return
      }
    } else {
      const count = parseInt(randomCount, 10)
      if (!count || count < 1) {
        setError('Cantidad inválida')
        return
      }
      const pool =
        filterBlock === 'all'
          ? [...allPuzzles]
          : allPuzzles.filter(p => String(p.blockId) === filterBlock)
      if (pool.length === 0) {
        setError('No hay puzzles disponibles')
        return
      }
      // Shuffle y tomar los primeros N
      const shuffled = pool.sort(() => Math.random() - 0.5)
      puzzleIds = shuffled.slice(0, count).map(p => p.id)
    }

    // Tiempo en segundos
    const timeLimitSeconds =
      timeLimitEnabled && timeLimitInput
        ? Math.max(1, parseFloat(timeLimitInput)) * 60
        : undefined

    setLoading(true)
    const socket = getSocket()
    socket.emit('create_room', {
      nickname,
      puzzleIds,
      timeLimit: timeLimitSeconds,
    })
    socket.once('room_created', ({ code }: { code: string }) => {
      navigate(`/room/${code}?nickname=${encodeURIComponent(nickname)}&host=1`)
    })
    socket.once('error', () => {
      setLoading(false)
      setError('Error al crear la sala')
    })
  }

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-bone-3 font-mono text-xs hover:text-bone transition-colors"
          >
            ← Inicio
          </button>
          <h2 className="text-2xl font-mono font-bold text-bone mt-4">Nueva sala</h2>
          <p className="text-bone-3 font-mono text-sm mt-1">
            Anfitrión: <span className="text-amber">{nickname}</span>
          </p>
        </div>

        {/* ── TIEMPO ─────────────────────────────────────── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <label className="text-bone-3 font-mono text-xs uppercase tracking-widest">
              Límite de tiempo
            </label>
            <button
              onClick={() => setTimeLimitEnabled(p => !p)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                timeLimitEnabled ? 'bg-amber' : 'bg-void-4'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-void transition-transform ${
                  timeLimitEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {timeLimitEnabled && (
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                step="0.5"
                value={timeLimitInput}
                onChange={e => setTimeLimitInput(e.target.value)}
                className="w-28 px-3 py-2 bg-void-2 border border-void-4 focus:border-amber rounded-sm font-mono text-bone text-sm outline-none"
                placeholder="minutos"
              />
              <span className="text-bone-3 font-mono text-sm">minutos</span>
            </div>
          )}
        </section>

        {/* ── PUZZLES ────────────────────────────────────── */}
        <section className="mb-8">
          <label className="block text-bone-3 font-mono text-xs uppercase tracking-widest mb-3">
            Ejercicios
          </label>

          {/* Modo toggle */}
          <div className="flex gap-2 mb-4">
            {(['random', 'manual'] as SelectionMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-sm font-mono text-xs transition-all border ${
                  mode === m
                    ? 'border-amber bg-amber/10 text-amber'
                    : 'border-void-4 bg-void-2 text-bone-3 hover:border-bone-3'
                }`}
              >
                {m === 'random' ? 'Aleatorio' : 'Manual'}
              </button>
            ))}
          </div>

          {/* Filtro de bloque (ambos modos) */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-bone-3 font-mono text-xs">Bloque:</span>
            <select
              value={filterBlock}
              onChange={e => setFilterBlock(e.target.value)}
              className="px-3 py-1.5 bg-void-2 border border-void-4 rounded-sm font-mono text-xs text-bone focus:border-amber outline-none"
            >
              <option value="all">Todos</option>
              {blockNames.map(([id, name]) => (
                <option key={id} value={String(id)}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {mode === 'random' ? (
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max={allPuzzles.length}
                value={randomCount}
                onChange={e => setRandomCount(e.target.value)}
                className="w-24 px-3 py-2 bg-void-2 border border-void-4 focus:border-amber rounded-sm font-mono text-bone text-sm outline-none"
              />
              <span className="text-bone-3 font-mono text-sm">
                ejercicios aleatorios
                {filterBlock !== 'all' && (
                  <span className="text-amber ml-1">del bloque</span>
                )}
              </span>
            </div>
          ) : (
            <>
              {loadingPuzzles ? (
                <p className="text-bone-3 font-mono text-sm">Cargando puzzles...</p>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-3">
                    <span className="font-mono text-xs text-bone-3">
                      {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={selectAll}
                      className="font-mono text-xs text-amber hover:underline"
                    >
                      Todos
                    </button>
                    <button
                      onClick={clearSelection}
                      className="font-mono text-xs text-bone-3 hover:text-bone hover:underline"
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                    {visiblePuzzles.map(p => {
                      const sel = selectedIds.has(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePuzzle(p.id)}
                          className={`flex items-center gap-2 px-3 py-2 border rounded-sm font-mono text-xs text-left transition-all ${
                            sel
                              ? 'border-amber bg-amber/10 text-bone'
                              : 'border-void-4 bg-void-2 text-bone-3 hover:border-bone-3'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${sel ? 'bg-amber' : 'bg-void-4'}`}
                          />
                          <span className="truncate">
                            #{p.orderInBlock}{' '}
                            <span className="text-bone-3">
                              {p.blockName ?? `B${p.blockId}`}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {error && (
          <p className="text-red-400 font-mono text-sm mb-4">{error}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={loading || loadingPuzzles}
          className="w-full py-4 bg-amber text-void font-mono font-bold text-sm tracking-widest uppercase hover:bg-amber-glow transition-colors rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Creando...' : 'Crear sala'}
        </button>
      </div>
    </div>
  )
}
