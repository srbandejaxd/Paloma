import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { fetchAllPuzzles, fetchBlocks } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Puzzle, Block } from '../types'

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

const CATEGORIES = [
  { id: "checkmate_patterns", label: "The Checkmate Patterns Manual" },
  { id: "palomita", label: "Woodpecker Method" },
  { id: "woodpecker_method2", label: "Woodpecker Method 2" },
  { id: "patterns_must_know", label: "Los 100 patrones que debes saber" },
]

const NAV_ITEMS = [
  { path: '/solo', label: 'Home', icon: '🏠' },
  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
  { path: '/vision', label: 'Visión', icon: '👁' },
  { path: '/history', label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
  { path: '/blind', label: 'Ciego', icon: '🎲' },
  { path: '/cycles', label: 'Ciclos', icon: '🔄' },
]

interface Position {
  fen: string
  from?: string
  to?: string
}

function buildPositions(puzzle: Puzzle): Position[] {
  const g = new Chess()
  try { g.load(puzzle.fen) } catch { return [{ fen: puzzle.fen }] }
  const list: Position[] = [{ fen: g.fen() }]
  for (const san of puzzle.solution) {
    let mv
    try { mv = g.move(san) } catch { break }
    if (!mv) break
    list.push({ fen: g.fen(), from: mv.from, to: mv.to })
  }
  return list
}

function buildLichessUrl(puzzle: Puzzle): string {
  // Abre Lichess con solo la posición inicial, sin solución
  const fen = puzzle.fen
  const color = fen.split(' ')[1] === 'w' ? 'white' : 'black'
  return `https://lichess.org/analysis/${fen}?color=${color}`
}

export default function Puzzles() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const [dark, setDark] = useState(true)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [allPuzzles, setAllPuzzles] = useState<Puzzle[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reviewPly, setReviewPly] = useState(0)

  useEffect(() => {
    const saved = localStorage.getItem('wp_theme')
    if (saved) setDark(saved === 'dark')
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    localStorage.setItem('wp_theme', next ? 'dark' : 'light')
  }

  useEffect(() => {
    if (!user) { navigate('/'); return }
    Promise.all([fetchBlocks(), fetchAllPuzzles()])
      .then(([b, p]) => {
        setBlocks(b)
        setAllPuzzles(p)

        const blockIdParam = searchParams.get('blockId')
        const puzzleIdParam = searchParams.get('puzzleId')
        
        if (blockIdParam) {
          const bid = parseInt(blockIdParam)
          const block = b.find(x => x.id === bid)
          if (block) {
            setSelectedCategory(block.category)
            setSelectedSubcategory(block.subcategory || null)
            setSelectedBlockId(bid)
            
            // Si también viene puzzleId, buscar ese puzzle en el bloque
            if (puzzleIdParam) {
              const puzzleId = parseInt(puzzleIdParam)
              const idx = p.filter(x => x.blockId === bid).findIndex(x => x.id === puzzleId)
              if (idx >= 0) setCurrentIdx(idx)
            }
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user, navigate, searchParams])

  const blocksForCategory = blocks.filter(b => b.category === selectedCategory)
  const subcategoriesForCategory = [...new Set(blocksForCategory.map(b => b.subcategory).filter(Boolean))] as string[]
  const hasSubcategories = subcategoriesForCategory.length > 0
  const blocksToShow = selectedCategory
    ? hasSubcategories
      ? (selectedSubcategory ? blocksForCategory.filter(b => b.subcategory === selectedSubcategory) : [])
      : blocksForCategory
    : []

  const filteredPuzzles = selectedBlockId
    ? allPuzzles.filter(p => p.blockId === selectedBlockId)
    : []

  const currentPuzzle = filteredPuzzles[currentIdx]
  const selectedBlock = blocks.find(b => b.id === selectedBlockId)

  // Reset review state when puzzle changes
  useEffect(() => {
    setReviewPly(0)
  }, [currentIdx, selectedBlockId])

  const positions = useMemo(() => currentPuzzle ? buildPositions(currentPuzzle) : [], [currentPuzzle])
  const maxPly = Math.max(0, positions.length - 1)
  const clampedPly = Math.min(reviewPly, maxPly)

  function selectCategory(catId: string) {
    setSelectedCategory(catId)
    setSelectedSubcategory(null)
    setSelectedBlockId(null)
    setCurrentIdx(0)
  }

  function selectSubcategory(sub: string) {
    setSelectedSubcategory(sub)
    setSelectedBlockId(null)
    setCurrentIdx(0)
  }

  function selectBlock(id: number) {
    setSelectedBlockId(id)
    setCurrentIdx(0)
  }



  function stepPly(delta: number) {
    setReviewPly(p => Math.max(0, Math.min(maxPly, p + delta)))
  }



  function openInLichess() {
    if (!currentPuzzle) return
    window.open(buildLichessUrl(currentPuzzle), '_blank', 'noopener,noreferrer')
  }

  // ── THEME TOKENS ────────────────────────────────────────────────────────────
  const t = dark ? {
    bg: 'bg-[#0A0A0F]',
    bg2: 'bg-[#12121A]',
    bg3: 'bg-[#1C1C28]',
    border: 'border-[#1F1F2E]',
    borderLight: 'border-[#2A2A3A]',
    text: 'text-[#E8E6E0]',
    text2: 'text-[#B8B5AC]',
    text3: 'text-[#7A776E]',
    accent: 'text-[#D4A017]',
    accentBg: 'bg-[#D4A017]',
    inputBg: 'bg-[#12121A] border-[#1F1F2E] focus:border-[#D4A017] text-[#E8E6E0]',
    track: 'bg-[#1F1F2E]',
  } : {
    bg: 'bg-[#FAFAF7]',
    bg2: 'bg-[#F3EFE7]',
    bg3: 'bg-[#EDE8DF]',
    border: 'border-[#E5DFD5]',
    borderLight: 'border-[#D9D2C8]',
    text: 'text-[#1A1814]',
    text2: 'text-[#4A4640]',
    text3: 'text-[#8A8478]',
    accent: 'text-[#A07810]',
    accentBg: 'bg-[#A07810]',
    inputBg: 'bg-[#F3EFE7] border-[#E5DFD5] focus:border-[#A07810] text-[#1A1814]',
    track: 'bg-[#E5DFD5]',
  }

  const accentColor = dark ? '#D4A017' : '#A07810'
  const lichessGreen = '#5b8c3e'

  if (loading) {
    return (
      <div className={`min-h-screen ${t.bg} flex items-center justify-center`}>
        <p className={t.text3}>Cargando puzzles...</p>
      </div>
    )
  }

  const playerColor = currentPuzzle ? (currentPuzzle.fen.split(' ')[1] === 'w' ? 'white' : 'black') : 'white'
  const rivalColor = playerColor === 'white' ? 'Negras' : 'Blancas'
  const plyCount = currentPuzzle?.solution.length ?? 0
  const moveCount = Math.ceil(plyCount / 2)

  const reviewHighlights: Record<string, { background: string }> = {}
  const reviewPos = positions[clampedPly]
  if (reviewPos?.from && reviewPos?.to) {
    reviewHighlights[reviewPos.from] = { background: 'rgba(212,160,23,0.25)' }
    reviewHighlights[reviewPos.to] = { background: 'rgba(212,160,23,0.4)' }
  }

  return (
    <div className={`min-h-screen ${t.bg} transition-colors duration-300`}>
      {/* Navbar */}
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>
                {user?.nickname}
              </h1>
            </div>
            <button
              onClick={toggleTheme}
              className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3} hover:${t.text}`}
              title={dark ? 'Tema claro' : 'Tema oscuro'}
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

      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12 animate-slide-up">
          <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Sin cronómetro</p>
          <h2 className={`text-5xl font-bold ${t.text} mb-4 leading-none`} style={{ letterSpacing: '-0.02em' }}>
            Explora y revisa puzzles
          </h2>
          <p className={`text-lg max-w-2xl ${t.text2} leading-relaxed`}>
            Elige una categoría, subcategoría y bloque. Resuelve a tu ritmo, revisa la solución jugada a jugada o ábrela en Lichess para analizarla con motor.
          </p>
        </div>

        {/* Selectors */}
        <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-12 animate-slide-up`}>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                Categoría
              </label>
              <select
                value={selectedCategory || ''}
                onChange={(e) => e.target.value ? selectCategory(e.target.value) : selectCategory('')}
                className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold`}
              >
                <option value="">Elige una categoría...</option>
                {CATEGORIES.filter(cat => blocks.some(b => b.category === cat.id)).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                Subcategoría
              </label>
              <select
                value={selectedSubcategory || ''}
                onChange={(e) => selectSubcategory(e.target.value)}
                disabled={!selectedCategory || !hasSubcategories}
                className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">
                  {!hasSubcategories ? 'Sin subcategorías' : 'Elige una subcategoría...'}
                </option>
                {subcategoriesForCategory.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-3`}>
                Bloque
              </label>
              <select
                value={selectedBlockId || ''}
                onChange={(e) => e.target.value && selectBlock(Number(e.target.value))}
                disabled={!selectedCategory || blocksToShow.length === 0}
                className={`w-full px-4 py-3 rounded-lg ${t.inputBg} border ${t.border} focus:outline-none transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">
                  {blocksToShow.length === 0 ? 'Sin bloques' : 'Elige un bloque...'}
                </option>
                {blocksToShow.map(block => (
                  <option key={block.id} value={block.id}>{block.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Sin selección */}
        {!selectedBlockId && (
          <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border animate-slide-up`}>
            <p className={`text-lg ${t.text2}`}>Elige categoría, subcategoría y bloque para empezar</p>
          </div>
        )}


        {/* Main */}
        {selectedBlockId && selectedBlock && currentPuzzle && (
          <div className="flex gap-8 lg:gap-10 animate-slide-up w-full justify-center">
            {/* Sidebar izquierda - Puzzles */}
            <div className="hidden lg:block w-40 flex-shrink-0">
              <div className={`sticky top-28 rounded-xl ${t.bg2} ${t.border} border p-3 space-y-1 max-h-[75vh] overflow-y-auto`}>
                {filteredPuzzles.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setCurrentIdx(i)}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-all font-semibold ${
                      i === currentIdx
                        ? 'border-transparent'
                        : `border-transparent ${t.text3} hover:${t.bg3}`
                    }`}
                    style={i === currentIdx ? { backgroundColor: 'rgba(212,160,23,0.12)', color: accentColor } : {}}
                  >
                    #{p.orderInBlock}
                  </button>
                ))}
              </div>
            </div>

            {/* Centro - Tablero y navegación puzzle */}
            <div className="w-full max-w-[480px] flex flex-col items-center gap-4 flex-shrink-0">
              {/* Header */}
              <div className="w-full flex items-center justify-between mb-2 max-w-[480px]">
                <div>
                  <p className={`text-xs uppercase tracking-widest ${t.text3}`}>{selectedBlock.name}</p>
                  <p className={`text-2xl font-bold ${t.text}`} style={{ letterSpacing: '-0.02em' }}>
                    Puzzle #{currentPuzzle.orderInBlock}
                  </p>
                </div>
                <span className={`font-mono text-xs ${t.text3}`}>{currentIdx + 1} / {filteredPuzzles.length}</span>
              </div>

              {/* Tablero */}
              <div style={{ width: '100%', maxWidth: 480 }}>
                <div className={`font-mono text-xs uppercase tracking-widest mb-3 flex items-center gap-2 ${t.text3}`}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: accentColor }} />
                  {clampedPly === 0 ? 'Posición inicial' : `Jugada ${clampedPly} de ${maxPly}`}
                </div>
                <div className="board-shadow rounded-sm overflow-hidden">
                  <Chessboard
                    position={reviewPos?.fen ?? currentPuzzle.fen}
                    boardOrientation={playerColor}
                    customSquareStyles={reviewHighlights}
                    arePiecesDraggable={false}
                    onPieceDrop={() => false}
                    customBoardStyle={{ borderRadius: '2px' }}
                    customDarkSquareStyle={{ backgroundColor: '#b58863' }}
                    customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
                    animationDuration={200}
                  />
                </div>

                {/* Jugada actual */}
                {currentPuzzle.solution[clampedPly - 1] && (
                  <p className={`text-center text-sm mt-3 font-mono font-bold`} style={{ color: accentColor }}>
                    {clampedPly % 2 === 1 ? `${Math.ceil(clampedPly / 2)}.` : `${clampedPly / 2}...`} {currentPuzzle.solution[clampedPly - 1]}
                  </p>
                )}
              </div>

              {/* Navegación entre puzzles */}
              <div className="flex items-center gap-3 justify-center flex-wrap max-w-[480px]">
                <button
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className={`px-4 py-2.5 text-xs rounded-lg border transition-all font-semibold ${t.bg2} ${t.border} ${t.text2} hover:${t.text} disabled:opacity-30`}
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setCurrentIdx(i => Math.min(filteredPuzzles.length - 1, i + 1))}
                  disabled={currentIdx === filteredPuzzles.length - 1}
                  className={`px-4 py-2.5 text-xs rounded-lg border transition-all font-semibold ${t.bg2} ${t.border} ${t.text2} hover:${t.text} disabled:opacity-30`}
                >
                  Siguiente →
                </button>
              </div>

              {/* Selector móvil */}
              <div className="lg:hidden w-full flex gap-1.5 flex-wrap justify-center px-4">
                {filteredPuzzles.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setCurrentIdx(i)}
                    className={`w-9 h-9 text-xs font-semibold rounded-lg border transition-all ${
                      i === currentIdx ? 'border-transparent' : `${t.border} ${t.text3}`
                    }`}
                    style={i === currentIdx ? { backgroundColor: 'rgba(212,160,23,0.12)', color: accentColor } : {}}
                  >
                    {p.orderInBlock}
                  </button>
                ))}
              </div>
            </div>

            {/* Derecha - Controles movimiento y Lichess */}
            <div className="hidden lg:flex flex-col items-center gap-4 w-auto flex-shrink-0 justify-center h-[480px] mt-8">
              {/* Fila horizontal: Retroceder | Contador | Siguiente */}
              <div className="flex items-center gap-2">
                {/* Botón Retroceder */}
                <button
                  onClick={() => stepPly(-1)}
                  disabled={clampedPly === 0}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${t.bg2} ${t.border} border font-bold text-xl hover:${t.bg3} disabled:opacity-30 disabled:cursor-not-allowed`}
                  title="Retroceder jugada"
                >
                  ←
                </button>

                {/* Contador de jugadas en línea */}
                <div className={`font-mono text-sm ${t.text3} font-semibold px-3`}>
                  {clampedPly}/{maxPly}
                </div>

                {/* Botón Siguiente */}
                <button
                  onClick={() => stepPly(1)}
                  disabled={clampedPly === maxPly}
                  className={`w-10 h-10 rounded-lg text-white font-bold text-xl transition-all flex items-center justify-center hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed`}
                  style={{ backgroundColor: clampedPly === maxPly ? accentColor + '80' : accentColor }}
                  title="Siguiente jugada"
                >
                  →
                </button>
              </div>


              {/* Botón Lichess - Full width con texto */}
              <button
                onClick={openInLichess}
                className="px-4 py-3 rounded-lg text-white font-bold text-sm tracking-widest uppercase transition-all hover:opacity-90 hover:shadow-lg flex items-center justify-center gap-2 whitespace-nowrap"
                style={{ backgroundColor: lichessGreen }}
                title="Abrir en Lichess"
              >
                ♞ Abrir en Lichess
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`${t.bg2} ${t.border} border-t backdrop-blur-xl`}>
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <p className={`text-sm ${t.text3}`}>Sin cronómetro — solo revisión</p>
          <button
            onClick={logout}
            className={`px-5 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-medium transition-all ${t.text3} hover:${t.text}`}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
