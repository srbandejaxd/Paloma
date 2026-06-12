import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAllPuzzles, fetchBlocks } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Puzzle, Block } from '../types'
import PuzzleBoard from '../components/Board/PuzzleBoard'

export default function Puzzles() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [allPuzzles, setAllPuzzles] = useState<Puzzle[]>([])
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [solved, setSolved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    Promise.all([fetchBlocks(), fetchAllPuzzles()])
      .then(([b, p]) => {
        setBlocks(b)
        setAllPuzzles(p)

        // Si venimos desde el resumen con un puzzle específico
        const blockId = searchParams.get('blockId')
        const puzzleId = searchParams.get('puzzleId')
        if (blockId) {
          const bid = parseInt(blockId)
          setSelectedBlock(bid)
          if (puzzleId) {
            const idx = p.filter(x => x.blockId === bid).findIndex(x => x.id === parseInt(puzzleId))
            if (idx >= 0) setCurrentIdx(idx)
          }
        } else if (b.length > 0) {
          setSelectedBlock(b[0].id)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, navigate])

  const filteredPuzzles = selectedBlock
    ? allPuzzles.filter(p => p.blockId === selectedBlock)
    : allPuzzles

  const currentPuzzle = filteredPuzzles[currentIdx]

  // Reset solved state when puzzle changes
  useEffect(() => { setSolved(false) }, [currentIdx, selectedBlock])

  // Reset index when block changes
  function selectBlock(id: number) {
    setSelectedBlock(id)
    setCurrentIdx(0)
  }

  const handleSolved = useCallback(() => { setSolved(true) }, [])
  const handleError = useCallback(() => {}, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <p className="text-bone-3 font-mono animate-pulse-amber">Cargando puzzles...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-void flex flex-col">
      {/* Header */}
      <div className="border-b border-void-4 bg-void-2">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/solo')} className="text-bone-3 font-mono text-xs hover:text-bone transition-colors">← Inicio</button>
            <h2 className="font-mono text-sm font-bold text-bone">Puzzles</h2>
          </div>
          <p className="text-bone-3 font-mono text-xs">Sin cronómetro — solo revisión</p>
        </div>

        {/* Block tabs */}
        <div className="max-w-4xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          {blocks.map(b => (
            <button
              key={b.id}
              onClick={() => selectBlock(b.id)}
              className={`px-3 py-1.5 font-mono text-xs border rounded-sm whitespace-nowrap transition-all ${
                selectedBlock === b.id ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3 hover:border-bone-3'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex gap-0 max-w-4xl mx-auto w-full px-0 sm:px-4 py-4 sm:py-6">
        {/* Puzzle list sidebar */}
        <div className="hidden sm:block w-48 flex-shrink-0 mr-6">
          <div className="sticky top-6 space-y-1 max-h-[80vh] overflow-y-auto pr-1">
            {filteredPuzzles.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setCurrentIdx(i)}
                className={`w-full text-left px-3 py-2 font-mono text-xs rounded-sm border transition-all ${
                  i === currentIdx
                    ? 'border-amber bg-amber/10 text-amber'
                    : 'border-transparent text-bone-3 hover:text-bone hover:border-void-4'
                }`}
              >
                #{p.orderInBlock}
              </button>
            ))}
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 flex flex-col items-center">
          {currentPuzzle && (
            <>
              <div className="w-full max-w-[480px]">
                <div className="flex items-center justify-between mb-4 px-4 sm:px-0">
                  <span className="font-mono text-bone-3 text-xs uppercase tracking-widest">
                    Puzzle #{currentPuzzle.orderInBlock}
                  </span>
                  <span className="font-mono text-bone-3 text-xs">{currentPuzzle.blockName}</span>
                </div>

                {solved && (
                  <div className="mb-3 px-4 sm:px-0">
                    <div className="bg-void-2 border border-green-900/40 rounded-sm px-4 py-2 text-center">
                      <p className="font-mono text-xs text-green-400">✓ Correcto</p>
                    </div>
                  </div>
                )}

                <PuzzleBoard
                  key={`${currentPuzzle.id}-${currentIdx}`}
                  puzzle={currentPuzzle}
                  onSolved={handleSolved}
                  onError={handleError}
                  autoSkipAfterErrors={0}
                />
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-4 mt-6">
                <button
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="px-6 py-2.5 font-mono text-sm border border-void-4 text-bone-3 hover:border-bone-3 hover:text-bone rounded-sm transition-all disabled:opacity-30"
                >
                  ← Anterior
                </button>
                <span className="font-mono text-xs text-bone-3">
                  {currentIdx + 1} / {filteredPuzzles.length}
                </span>
                <button
                  onClick={() => setCurrentIdx(i => Math.min(filteredPuzzles.length - 1, i + 1))}
                  disabled={currentIdx === filteredPuzzles.length - 1}
                  className="px-6 py-2.5 font-mono text-sm border border-void-4 text-bone-3 hover:border-bone-3 hover:text-bone rounded-sm transition-all disabled:opacity-30"
                >
                  Siguiente →
                </button>
              </div>

              {/* Mobile puzzle selector */}
              <div className="sm:hidden mt-4 flex gap-1 flex-wrap justify-center px-4">
                {filteredPuzzles.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setCurrentIdx(i)}
                    className={`w-8 h-8 font-mono text-xs rounded-sm border transition-all ${
                      i === currentIdx ? 'border-amber bg-amber/10 text-amber' : 'border-void-4 text-bone-3'
                    }`}
                  >
                    {p.orderInBlock}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
