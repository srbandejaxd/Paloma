import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Chess } from 'chess.js'
import { useAuth } from '../lib/auth'
import {
  fetchRepertoire, createOpening, fetchOpeningTree, addOpeningNodes,
  renameOpening, deleteOpening,
  Opening, OpeningNode, OpeningTree, ImportNode
} from '../lib/api'
import { Chessboard } from 'react-chessboard'
import PuzzleBoard from '../components/Board/PuzzleBoard'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { path: '/home',        label: 'Home',      icon: '🏠' },
  { path: '/cycles',      label: 'Ciclos',    icon: '🕊️' },
  { path: '/solo',        label: 'Solo',      icon: '⚡' },
  { path: '/puzzles',     label: 'Puzzles',   icon: '📚' },
  { path: '/vision',      label: 'Visión',    icon: '👁' },
  { path: '/history',     label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking',   icon: '🏆' },
  { path: '/blind',       label: 'Ciego',     icon: '🎲' },
  { path: '/openings',    label: 'Aperturas', icon: '♟' },
]

const PIECE_SYMBOLS: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞',
}

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type Screen = 'repertoire' | 'opening' | 'train' | 'practice'
type Color = 'white' | 'black'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Parsear PGN con variantes en árbol de nodos
function parsePgnToNodes(pgn: string, repertoireColor: Color): ImportNode[] {
  const nodes: ImportNode[] = []
  let tempIdCounter = 0

  function nextId() { return `n${tempIdCounter++}` }

  function parseVariation(
    tokens: string[],
    idx: number,
    parentTempId: string | null,
    game: Chess,
    orderIndex: number
  ): { idx: number; lastId: string | null } {
    let lastId = parentTempId
    let order = orderIndex

    while (idx < tokens.length) {
      const token = tokens[idx]

      if (token === ')') return { idx, lastId }
      if (token === '(' ) {
        // Sub-variante: clonar estado actual del juego
        const savedFen = game.fen()
        const result = parseVariation(tokens, idx + 1, lastId, new Chess(savedFen), order)
        idx = result.idx + 1
        order++
        continue
      }
      // Ignorar numeración (1., 2., 1... etc.) y resultado
      if (/^\d+\./.test(token) || ['*', '1-0', '0-1', '1/2-1/2'].includes(token)) {
        idx++
        continue
      }
      // Intentar hacer el movimiento
      try {
        const moveResult = game.move(token)
        if (moveResult) {
          const id = nextId()
          const moveColor = moveResult.color === 'w' ? 'white' : 'black'
          nodes.push({
            tempId: id,
            parentTempId: lastId,
            move: moveResult.san,
            fen: game.fen(),
            moveNumber: Math.ceil(game.history().length / 2),
            color: moveColor,
            orderIndex: order,
          })
          lastId = id
          order = 0
        }
      } catch {}
      idx++
    }
    return { idx, lastId }
  }

  // Tokenizar el PGN: eliminar headers y comentarios
  const cleaned = pgn
    .replace(/\[.*?\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\([^()]*\)/g, (m) => m) // mantener variantes
    .trim()

  // Tokenizar respetando paréntesis
  const tokens: string[] = []
  let i = 0
  let buf = ''
  while (i < cleaned.length) {
    const ch = cleaned[i]
    if (ch === '(' || ch === ')') {
      if (buf.trim()) tokens.push(...buf.trim().split(/\s+/).filter(Boolean))
      buf = ''
      tokens.push(ch)
    } else {
      buf += ch
    }
    i++
  }
  if (buf.trim()) tokens.push(...buf.trim().split(/\s+/).filter(Boolean))

  const game = new Chess()
  parseVariation(tokens, 0, null, game, 0)
  return nodes
}

// Construir árbol jerárquico desde lista plana
interface TreeNode extends OpeningNode {
  children: TreeNode[]
}

function buildTree(nodes: OpeningNode[]): TreeNode[] {
  const map = new Map<number, TreeNode>()
  const roots: TreeNode[] = []
  for (const n of nodes) {
    map.set(n.id, { ...n, children: [] })
  }
  for (const n of nodes) {
    const node = map.get(n.id)!
    if (n.parentId === null) {
      roots.push(node)
    } else {
      const parent = map.get(n.parentId)
      if (parent) parent.children.push(node)
    }
  }
  // Ordenar hijos por orderIndex
  function sortChildren(node: TreeNode) {
    node.children.sort((a, b) => a.orderIndex - b.orderIndex)
    node.children.forEach(sortChildren)
  }
  roots.sort((a, b) => a.orderIndex - b.orderIndex)
  roots.forEach(sortChildren)
  return roots
}

// Obtener línea desde raíz hasta un nodo
function getLineToNode(nodes: OpeningNode[], targetId: number): OpeningNode[] {
  const map = new Map<number, OpeningNode>()
  for (const n of nodes) map.set(n.id, n)
  const line: OpeningNode[] = []
  let current = map.get(targetId)
  while (current) {
    line.unshift(current)
    current = current.parentId !== null ? map.get(current.parentId) : undefined
  }
  return line
}

// Renderizar movimiento con ícono de pieza
function MoveChip({ move, active, onClick }: { move: string; active?: boolean; onClick?: () => void }) {
  const piece = move.match(/^([KQRBN])/)?.[1]
  const symbol = piece ? PIECE_SYMBOLS[piece] : null
  const text = piece ? move.slice(1) : move

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-sm font-mono font-semibold transition-all select-none ${
        active
          ? 'bg-[#D4A017] text-white shadow-md scale-105'
          : 'bg-[#1C1C28] text-[#B8B5AC] hover:bg-[#2A2A3A] hover:text-[#E8E6E0]'
      }`}
    >
      {symbol && <span className="text-base leading-none">{symbol}</span>}
      <span>{text}</span>
    </button>
  )
}

// ─── TRIE CANVAS (interactive pan/zoom) ──────────────────────────────────────

const N_W = 112, N_H = 38, H_GAP = 32, V_GAP = 58

function subtreeH(node: TreeNode): number {
  if (node.children.length === 0) return N_H
  return node.children.reduce(
    (sum, child, i) => sum + subtreeH(child) + (i > 0 ? V_GAP : 0), 0
  )
}

function computeLayout(roots: TreeNode[]) {
  const pos = new Map<number, { x: number; y: number }>()
  function place(node: TreeNode, x: number, y: number) {
    pos.set(node.id, { x, y })
    let cumY = y
    for (let i = 0; i < node.children.length; i++) {
      place(node.children[i], x + N_W + H_GAP, cumY)
      cumY += subtreeH(node.children[i]) + V_GAP
    }
  }
  let y = 0
  for (const root of roots) {
    place(root, 0, y)
    y += subtreeH(root) + V_GAP * 2
  }
  return pos
}

function flatAll(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap(n => [n, ...flatAll(n.children)])
}

function TrieCanvas({
  roots, selectedId, onSelect, t, accentColor, dark, collapsed, onToggleCollapse, annotations
}: {
  roots: TreeNode[]
  selectedId: number | null
  onSelect: (node: TreeNode) => void
  t: Record<string, string>
  accentColor: string
  dark: boolean
  collapsed: Set<number>
  onToggleCollapse: (id: number) => void
  annotations: Record<number, { text: string; symbol: string }>
}) {
  const [offset, setOffset] = useState({ x: 60, y: 60 })
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  const positions = useMemo(() => {
    // Build a filtered tree respecting collapsed state
    function filterTree(nodes: TreeNode[]): TreeNode[] {
      return nodes.map(n => ({
        ...n,
        children: collapsed.has(n.id) ? [] : filterTree(n.children)
      }))
    }
    return computeLayout(filterTree(roots))
  }, [roots, collapsed])
  const allNodes = useMemo(() => {
    function flatFiltered(nodes: TreeNode[]): TreeNode[] {
      return nodes.flatMap(n => [n, ...(collapsed.has(n.id) ? [] : flatFiltered(n.children))])
    }
    return flatFiltered(roots)
  }, [roots, collapsed])

  let maxX = 0, maxY = 0
  for (const { x, y } of positions.values()) {
    maxX = Math.max(maxX, x + N_W)
    maxY = Math.max(maxY, y + N_H)
  }
  const svgW = maxX + 120
  const svgH = maxY + 120

  const chipBg     = dark ? '#18182A' : '#E8E3DA'
  const chipBorder = dark ? '#38385A' : '#C4BBAA'
  const edgeColor  = dark ? '#38385A' : '#C4BBAA'

  const edges: Array<{ from: {x:number,y:number}; to: {x:number,y:number}; isMain: boolean }> = []
  for (const node of allNodes) {
    const pp = positions.get(node.id)
    if (!pp) continue
    node.children.forEach((child, i) => {
      const cp = positions.get(child.id)
      if (!cp) return
      edges.push({
        from: { x: pp.x + N_W, y: pp.y + N_H / 2 },
        to:   { x: cp.x,       y: cp.y + N_H / 2 },
        isMain: i === 0,
      })
    })
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setScale(s => Math.min(3, Math.max(0.25, s * (e.deltaY > 0 ? 0.9 : 1.1))))
  }
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    setOffset({ x: dragStart.current.ox + e.clientX - dragStart.current.x, y: dragStart.current.oy + e.clientY - dragStart.current.y })
  }
  function onMouseUp() { setDragging(false) }

  if (roots.length === 0) return (
    <div className={`flex-1 flex items-center justify-center flex-col gap-3 ${t.text3}`}>
      <span className="text-3xl">♟</span>
      <p className="text-sm">Sin movimientos. Usa &quot;+ Agregar línea&quot; para empezar.</p>
    </div>
  )

  return (
    <div
      className="flex-1 relative overflow-hidden"
      style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', minHeight: 0 }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div style={{ position: 'absolute', transform: `translate(${offset.x}px,${offset.y}px) scale(${scale})`, transformOrigin: '0 0', width: svgW, height: svgH }}>
        {/* Edges */}
        <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} width={svgW} height={svgH}>
          {edges.map((e, i) => {
            const cx1 = e.from.x + 24, cy1 = e.from.y
            const cx2 = e.to.x - 24,   cy2 = e.to.y
            return (
              <path
                key={i}
                d={`M${e.from.x},${e.from.y} C${cx1},${cy1} ${cx2},${cy2} ${e.to.x},${e.to.y}`}
                stroke={edgeColor}
                strokeWidth={e.isMain ? 2 : 1.5}
                fill="none"
                strokeDasharray={e.isMain ? undefined : '5 3'}
                opacity={e.isMain ? 0.9 : 0.6}
              />
            )
          })}
        </svg>

        {/* Nodes */}
        {allNodes.map(node => {
          const p = positions.get(node.id)
          if (!p) return null
          const isSel = node.id === selectedId
          const hasChildren = node.children.length > 0
          const piece = node.move.match(/^([KQRBN])/)?.[1]
          const sym   = piece ? PIECE_SYMBOLS[piece] : null
          const txt   = piece ? node.move.slice(1) : node.move
          return (
            <div
              key={node.id}
              style={{ position: 'absolute', left: p.x, top: p.y, width: N_W + (hasChildren ? 18 : 0) }}
            >
              <div
                data-node="true"
                onClick={() => onSelect(node)}
                style={{
                  width: N_W, height: N_H,
                  backgroundColor: isSel ? accentColor : chipBg,
                  border: `1.5px solid ${isSel ? accentColor : chipBorder}`,
                  borderRadius: 24, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 3, cursor: 'pointer',
                  boxShadow: isSel ? `0 0 0 3px ${accentColor}44, 0 2px 12px ${accentColor}55` : '0 1px 4px rgba(0,0,0,0.35)',
                  transition: 'box-shadow 0.15s',
                }}
              >
                {sym && (
                  <span style={{ fontSize: 16, lineHeight: 1, color: isSel ? (dark ? '#000' : '#fff') : (dark ? '#E0DDD4' : '#2A2620') }}>
                    {sym}
                  </span>
                )}
                <span style={{
                  fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                  color: isSel ? (dark ? '#000' : '#fff') : (dark ? '#C8C5BC' : '#3A3630'),
                  letterSpacing: 0.3, whiteSpace: 'nowrap',
                }}>
                  {node.color === 'white' && `${node.moveNumber}. `}{txt}
                </span>
              </div>
              {/* Annotation symbol badge */}
              {(() => {
                const annData = annotations[node.id] ?? null
                return annData?.symbol ? (
                  <div style={{
                    position: 'absolute', top: -8, right: hasChildren ? 22 : 2,
                    backgroundColor: accentColor, color: dark ? '#000' : '#fff',
                    borderRadius: 99, minWidth: 20, height: 20, padding: '0 4px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, zIndex: 3,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}>
                    {annData.symbol}
                  </div>
                ) : null
              })()}
              {/* Collapse/expand button */}
              {hasChildren && (
                <div
                  data-node="true"
                  onClick={() => onToggleCollapse(node.id)}
                  style={{
                    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 18, height: 18, borderRadius: '50%',
                    backgroundColor: dark ? '#38385A' : '#C4BBAA',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: 11, fontWeight: 700, color: dark ? '#E0DDD4' : '#2A2620',
                    zIndex: 2,
                  }}
                >
                  {collapsed.has(node.id) ? '+' : '−'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { label: '+', action: () => setScale(s => Math.min(3, s * 1.2)) },
          { label: '−', action: () => setScale(s => Math.max(0.25, s / 1.2)) },
          { label: '⊡', action: () => { setScale(1); setOffset({ x: 60, y: 60 }) } },
        ].map(b => (
          <button key={b.label} onClick={b.action}
            className={`w-8 h-8 rounded-lg ${t.bg3} ${t.border} border font-bold ${t.text2} flex items-center justify-center text-sm transition-all hover:scale-110`}
          >{b.label}</button>
        ))}
      </div>
    </div>
  )
}

// ─── ICONS ────────────────────────────────────────────────────────────────────

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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const NAV_ITEMS_DEF = [
  { path: '/solo', label: 'Home', icon: '🏠' },
  { path: '/puzzles', label: 'Puzzles', icon: '⚡' },
  { path: '/vision', label: 'Visión', icon: '👁' },
  { path: '/history', label: 'Historial', icon: '📋' },
  { path: '/leaderboard', label: 'Ranking', icon: '🏆' },
  { path: '/blind', label: 'Ciego', icon: '🎲' },
  { path: '/cycles', label: 'Ciclos', icon: '🔄' },
  { path: '/openings', label: 'Aperturas', icon: '♟' },
]

function NavBar({ t, dark, toggleTheme, navigate, location, accentColor, user, logout }: {
  t: Record<string, string>
  dark: boolean
  toggleTheme: () => void
  navigate: (path: string) => void
  location: { pathname: string }
  accentColor: string
  user: { nickname: string } | null
  logout: () => void
}) {
  return (
    <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95`}>
      <div className="max-w-7xl mx-auto px-6 py-5">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
            <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user?.nickname}</h1>
          </div>
          <button onClick={toggleTheme} className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}>
            {dark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {NAV_ITEMS_DEF.map((item, idx) => {
            const isActive = location.pathname === item.path
            return (
              <div key={item.path} className="flex items-center">
                <button
                  onClick={() => navigate(item.path)}
                  className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all relative group ${isActive ? t.text : t.text2}`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="whitespace-nowrap">{item.label}</span>
                  <div
                    className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`}
                    style={{ backgroundColor: accentColor }}
                  />
                </button>
                {idx < NAV_ITEMS_DEF.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
              </div>
            )
          })}
        </div>
      </div>
    </nav>
  )
}


export default function Openings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [dark, setDark] = useState(true)

  // Navigation state
  const [color, setColor] = useState<Color>('white')
  const [screen, setScreen] = useState<Screen>('repertoire')
  const [openings, setOpenings] = useState<Opening[]>([])
  const [repertoireId, setRepertoireId] = useState<number | null>(null)
  const [activeOpening, setActiveOpening] = useState<OpeningTree | null>(null)

  // Tree state
  const [treeRoots, setTreeRoots] = useState<TreeNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [selectedFen, setSelectedFen] = useState(INITIAL_FEN)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  // Training state
  const [trainLine, setTrainLine] = useState<OpeningNode[]>([])
  const [trainStep, setTrainStep] = useState(0)
  const [trainHintSquare, setTrainHintSquare] = useState<string | null>(null)
  const [annotations, setAnnotations] = useState<Record<number, { text: string; symbol: string }>>({})
  const [practiceIdx, setPracticeIdx] = useState(0)
  const [practiceLine, setPracticeLine] = useState<OpeningNode[]>([])
  const [trainGame, setTrainGame] = useState<Chess | null>(null)
  const [trainDone, setTrainDone] = useState(false)
  const [trainErrors, setTrainErrors] = useState(0)
  const [waitingRival, setWaitingRival] = useState(false)

  // Import / create state
  const [showImport, setShowImport] = useState(false)
  const [importName, setImportName] = useState('')
  const [importPgn, setImportPgn] = useState('')
  const [importMode, setImportMode] = useState<'manual' | 'pgn'>('pgn')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  // Add lines state
  const [addingLines, setAddingLines] = useState(false)
  const [addGame, setAddGame] = useState<Chess | null>(null)
  const [addMoves, setAddMoves] = useState<ImportNode[]>([])
  const [addParentId, setAddParentId] = useState<number | null>(null)

  // Rename / delete
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [loading, setLoading] = useState(false)

  const rivalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    loadRepertoire(color)
  }, [user, color])

  async function loadRepertoire(c: Color) {
    setLoading(true)
    try {
      const data = await fetchRepertoire(c)
      setOpenings(data.openings)
      setRepertoireId(data.repertoireId)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function loadOpening(id: number) {
    setLoading(true)
    try {
      const data = await fetchOpeningTree(id)
      setActiveOpening(data)
      const roots = buildTree(data.nodes)
      setTreeRoots(roots)
      setSelectedNodeId(null)
      setSelectedFen(INITIAL_FEN)
      setCollapsed(new Set())
      setScreen('opening')
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  function handleSelectNode(node: TreeNode) {
    setSelectedNodeId(node.id)
    setSelectedFen(node.fen)
  }

  function toggleCollapse(id: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── IMPORT PGN ──────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!importName.trim() || !importPgn.trim()) {
      setImportError('Nombre y PGN son requeridos')
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      const nodes = parsePgnToNodes(importPgn, color)
      if (nodes.length === 0) {
        setImportError('No se encontraron movimientos válidos en el PGN')
        setImporting(false)
        return
      }
      await createOpening({ color, name: importName.trim(), nodes })
      setImportName('')
      setImportPgn('')
      setShowImport(false)
      await loadRepertoire(color)
    } catch (e: unknown) {
      setImportError((e as Error).message || 'Error al importar')
    } finally { setImporting(false) }
  }

  // ── ADD LINES ───────────────────────────────────────────────────────────────
  function startAddLines() {
    if (!activeOpening || !selectedNodeId) return
    const node = activeOpening.nodes.find(n => n.id === selectedNodeId)
    const game = new Chess()
    if (node) {
      game.load(node.fen)
      setAddParentId(selectedNodeId)
    } else {
      setAddParentId(null)
    }
    setAddGame(game)
    setAddMoves([])
    setAddingLines(true)
  }

  async function handleAddLineMove(move: string) {
    if (!addGame || !activeOpening) return
    try {
      const result = addGame.move(move)
      if (!result) return
      const newGame = new Chess()
      newGame.load(addGame.fen())
      const tempId = `new_${Date.now()}_${Math.random()}`
      const lastMove = addMoves[addMoves.length - 1]
      const newNode: ImportNode = {
        tempId,
        parentTempId: lastMove ? lastMove.tempId : null,
        move: result.san,
        fen: addGame.fen(),
        moveNumber: Math.ceil(addGame.history().length / 2),
        color: result.color === 'w' ? 'white' : 'black',
        orderIndex: 0,
      }
      setAddMoves(prev => [...prev, newNode])
      setAddGame(new Chess(addGame.fen()))
    } catch {}
  }

  async function saveAddedLines() {
    if (!activeOpening || addMoves.length === 0) return
    setLoading(true)
    try {
      // Ajustar parentTempId del primer nodo al nodo real
      const adjusted = addMoves.map((n, i) => ({
        ...n,
        parentTempId: i === 0 ? null : n.parentTempId,
      }))
      // El primer nodo apunta al nodo seleccionado real
      if (adjusted[0] && addParentId !== null) {
        adjusted[0] = { ...adjusted[0], parentTempId: String(addParentId) }
      }
      await addOpeningNodes(activeOpening.id, adjusted)
      setAddingLines(false)
      setAddMoves([])
      await loadOpening(activeOpening.id)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // ── TRAIN ───────────────────────────────────────────────────────────────────
  function startTraining(targetNodeId: number) {
    if (!activeOpening) return
    const line = getLineToNode(activeOpening.nodes, targetNodeId)
    if (line.length === 0) return

    const game = new Chess()
    setTrainLine(line)
    setTrainStep(0)
    setTrainGame(game)
    setTrainDone(false)
    setTrainErrors(0)
    setWaitingRival(false)
    setTrainHintSquare(null)
    setScreen('train')
  }

  // Keyboard navigation for practice
  useEffect(() => {
    if (screen !== 'practice') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setPracticeIdx(i => Math.min(practiceLine.length - 1, i + 1))
      if (e.key === 'ArrowLeft')  setPracticeIdx(i => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, practiceLine.length])

  function startPractice(targetNodeId: number) {
    if (!activeOpening) return
    const line = getLineToNode(activeOpening.nodes, targetNodeId)
    if (line.length === 0) return
    setPracticeLine(line)
    setPracticeIdx(0)
    setScreen('practice')
  }

  // Avanzar al siguiente paso del entrenamiento
  const advanceTrainStep = useCallback((currentStep: number, currentGame: Chess, line: OpeningNode[]) => {
    const nextStep = currentStep + 1
    if (nextStep >= line.length) {
      setTrainDone(true)
      return
    }
    const nextNode = line[nextStep]
    // Si el siguiente movimiento es del rival, lo hacemos automáticamente
    if (nextNode.color !== color) {
      setWaitingRival(true)
      rivalTimerRef.current = setTimeout(() => {
        try {
          const g = new Chess(currentGame.fen())
          g.move(nextNode.move)
          setTrainGame(g)
          setTrainStep(nextStep)
          setWaitingRival(false)
          // Recursivo — podría haber varios movimientos del rival seguidos
          advanceTrainStep(nextStep, g, line)
        } catch {}
      }, 600)
    } else {
      setTrainStep(nextStep)
    }
  }, [color])

  useEffect(() => {
    return () => { if (rivalTimerRef.current) clearTimeout(rivalTimerRef.current) }
  }, [])

  // Cuando empieza el entrenamiento, hacer los primeros movimientos del rival si corresponde
  useEffect(() => {
    if (screen !== 'train' || !trainGame || trainLine.length === 0 || trainStep !== 0) return
    const firstNode = trainLine[0]
    if (firstNode.color !== color) {
      advanceTrainStep(-1, trainGame, trainLine)
    }
  }, [screen, trainLine])

  function handleTrainSolved() {
    if (!trainGame) return
    const currentNode = trainLine[trainStep]
    try {
      const g = new Chess(trainGame.fen())
      g.move(currentNode.move)
      setTrainGame(g)
      advanceTrainStep(trainStep, g, trainLine)
    } catch {}
  }

  function showTrainHint() {
    if (!trainGame || !trainLine[trainStep]) return
    const expectedSan = trainLine[trainStep].move
    const g = new Chess(trainGame.fen())
    try {
      const m = g.move(expectedSan)
      if (m) { setTrainHintSquare(m.from); setTimeout(() => setTrainHintSquare(null), 1500) }
    } catch {}
  }

  function handleTrainError() {
    setTrainErrors(e => e + 1)
  }

  // THEME
  const t = dark ? {
    bg: 'bg-[#0A0A0F]', bg2: 'bg-[#12121A]', bg3: 'bg-[#1C1C28]',
    border: 'border-[#1F1F2E]', borderLight: 'border-[#2A2A3A]',
    text: 'text-[#E8E6E0]', text2: 'text-[#B8B5AC]', text3: 'text-[#7A776E]',
    inputBg: 'bg-[#12121A] border-[#1F1F2E] text-[#E8E6E0]',
  } : {
    bg: 'bg-[#FAFAF7]', bg2: 'bg-[#F3EFE7]', bg3: 'bg-[#EDE8DF]',
    border: 'border-[#E5DFD5]', borderLight: 'border-[#D9D2C8]',
    text: 'text-[#1A1814]', text2: 'text-[#4A4640]', text3: 'text-[#8A8478]',
    inputBg: 'bg-[#F3EFE7] border-[#E5DFD5] text-[#1A1814]',
  }
  const accentColor = dark ? '#D4A017' : '#A07810'

  function Nav() {
    return (
      <nav className={`sticky top-0 z-50 ${t.bg2} ${t.border} border-b backdrop-blur-xl bg-opacity-95`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className={`text-xs uppercase tracking-[0.15em] ${t.text3} mb-1`}>Bienvenido de vuelta</p>
              <h1 className={`text-3xl font-bold ${t.text} leading-none`} style={{ letterSpacing: '-0.02em' }}>{user?.nickname}</h1>
            </div>
            <button onClick={toggleTheme} className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}>
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
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'}`} style={{ backgroundColor: accentColor }} />
                  </button>
                  {idx < NAV_ITEMS.length - 1 && <div className={`w-px h-4 ${t.borderLight}`} />}
                </div>
              )
            })}
          </div>
        </div>
      </nav>
    )
  }

  // ── TRAIN SCREEN ─────────────────────────────────────────────────────────────
  // ── PRACTICE SCREEN ──────────────────────────────────────────────────────
  if (screen === 'practice') {
    const node = practiceLine[practiceIdx] ?? null
    const fen  = node ? node.fen : INITIAL_FEN
    const ann  = node ? (annotations[node.id] ?? { text: '', symbol: '' }) : { text: '', symbol: '' }

    const SYMBOLS = [
      { sym: '!',  label: 'Buen movimiento' },
      { sym: '!!', label: 'Brillante' },
      { sym: '?',  label: 'Error' },
      { sym: '??', label: 'Error grave' },
      { sym: '!?', label: 'Interesante' },
      { sym: '?!', label: 'Dudoso' },
      { sym: '∞',  label: 'Poco claro' },
      { sym: '=',  label: 'Igual' },
      { sym: '±',  label: 'Blancas mejor' },
      { sym: '∓',  label: 'Negras mejor' },
      { sym: '⊕',  label: 'Con compensación' },
      { sym: '□',  label: 'Único movimiento' },
    ]

    function saveSymbol(sym: string) {
      if (!node) return
      setAnnotations(prev => ({
        ...prev,
        [node.id]: { text: prev[node.id]?.text ?? '', symbol: prev[node.id]?.symbol === sym ? '' : sym }
      }))
    }

    function saveText(text: string) {
      if (!node) return
      setAnnotations(prev => ({
        ...prev,
        [node.id]: { symbol: prev[node.id]?.symbol ?? '', text }
      }))
    }

    return (
      <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300 flex flex-col`}>
        <NavBar t={t} dark={dark} toggleTheme={toggleTheme} navigate={navigate} location={location} accentColor={accentColor} user={user} logout={logout} />

        <div className="flex-1 flex flex-col px-6 pt-6 pb-6 gap-4 max-w-7xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setScreen('opening')} className={`flex items-center gap-2 text-sm ${t.text3} hover:${t.text} transition-colors`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Volver
              </button>
              <div className={`w-px h-4 ${t.borderLight}`} />
              <h2 className={`text-xl font-bold ${t.text}`}>{activeOpening?.name} · Práctica</h2>
            </div>
            <p className={`text-sm ${t.text3}`}>
              {practiceIdx + 1} / {practiceLine.length}
            </p>
          </div>

          {/* Main 3-column layout */}
          <div className="flex gap-4 flex-1 min-h-0">

            {/* LEFT — Símbolos de anotación */}
            <div className={`w-52 flex-shrink-0 rounded-xl ${t.bg2} ${t.border} border overflow-hidden flex flex-col`}>
              <div className={`px-4 py-3 border-b ${t.border}`}>
                <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>Símbolo</p>
              </div>
              <div className="p-3 flex flex-col gap-1.5 overflow-y-auto">
                {SYMBOLS.map(({ sym, label }) => {
                  const isActive = ann.symbol === sym
                  return (
                    <button
                      key={sym}
                      onClick={() => saveSymbol(sym)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
                      style={{
                        backgroundColor: isActive ? `${accentColor}22` : 'transparent',
                        border: `1.5px solid ${isActive ? accentColor : 'transparent'}`,
                        color: isActive ? accentColor : undefined,
                      }}
                    >
                      <span className="text-lg font-bold w-6 text-center flex-shrink-0">{sym}</span>
                      <span className={`text-xs ${isActive ? '' : t.text3}`}>{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* CENTER — Tablero + navegación */}
            <div className="flex-1 flex flex-col items-center gap-4 min-w-0">
              {/* Board */}
              <div style={{ position: 'relative' }}>
                <Chessboard
                  id="practice-board"
                  boardWidth={440}
                  position={fen}
                  boardOrientation={color}
                  arePiecesDraggable={false}
                  customDarkSquareStyle={{ backgroundColor: '#b58863' }}
                  customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
                  animationDuration={200}
                />
                {/* Symbol badge overlay */}
                {ann.symbol && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    backgroundColor: accentColor, color: '#000',
                    borderRadius: 99, width: 36, height: 36,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  }}>
                    {ann.symbol}
                  </div>
                )}
              </div>

              {/* Move info */}
              <div className="flex items-center gap-2">
                {node && (
                  <span className={`text-sm font-mono font-bold px-3 py-1.5 rounded-lg ${t.bg2} ${t.border} border`}>
                    {node.color === 'white' ? `${node.moveNumber}. ` : `${node.moveNumber}... `}
                    {node.move}
                    {ann.symbol && <span className="ml-1.5 text-base" style={{ color: accentColor }}>{ann.symbol}</span>}
                  </span>
                )}
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPracticeIdx(i => Math.max(0, i - 1))}
                  disabled={practiceIdx === 0}
                  className={`w-12 h-12 rounded-xl border ${t.border} flex items-center justify-center text-xl font-bold disabled:opacity-30 hover:scale-105 transition-all ${t.bg2} ${t.text2}`}
                >‹</button>
                <span className={`text-sm ${t.text3} w-24 text-center`}>
                  {practiceIdx + 1} / {practiceLine.length}
                </span>
                <button
                  onClick={() => setPracticeIdx(i => Math.min(practiceLine.length - 1, i + 1))}
                  disabled={practiceIdx >= practiceLine.length - 1}
                  className={`w-12 h-12 rounded-xl border ${t.border} flex items-center justify-center text-xl font-bold disabled:opacity-30 hover:scale-105 transition-all ${t.bg2} ${t.text2}`}
                >›</button>
              </div>
              <p className={`text-xs ${t.text3}`}>También puedes usar ← → del teclado</p>
            </div>

            {/* RIGHT — Anotación de texto */}
            <div className={`w-64 flex-shrink-0 rounded-xl ${t.bg2} ${t.border} border overflow-hidden flex flex-col`}>
              <div className={`px-4 py-3 border-b ${t.border}`}>
                <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>Ideas de la posición</p>
              </div>
              <textarea
                value={ann.text}
                onChange={e => saveText(e.target.value)}
                placeholder="Escribe tus ideas, planes, amenazas..."
                className={`flex-1 px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none bg-transparent ${t.text2}`}
                style={{ fontFamily: 'inherit' }}
              />
              {/* Mini line navigator */}
              <div className={`border-t ${t.border} px-4 py-3`}>
                <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-2`}>Línea</p>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {practiceLine.map((n, i) => {
                    const a = annotations[n.id]
                    return (
                      <button
                        key={n.id}
                        onClick={() => setPracticeIdx(i)}
                        className="px-2 py-1 rounded text-xs font-mono font-bold transition-all"
                        style={{
                          backgroundColor: i === practiceIdx ? accentColor : (dark ? '#1C1C28' : '#E2DBD0'),
                          color: i === practiceIdx ? '#000' : undefined,
                        }}
                      >
                        {n.color === 'white' ? `${n.moveNumber}.` : ''}{n.move}
                        {a?.symbol && <span className="ml-0.5">{a.symbol}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'train') {
    const currentNode = trainLine[trainStep]
    const progress = trainLine.length > 0 ? (trainStep / trainLine.length) * 100 : 0

    if (trainDone) {
      return (
        <div className={`min-h-screen ${t.bg} flex items-center justify-center px-6`}>
          <div className={`w-full max-w-md text-center rounded-2xl ${t.bg2} ${t.border} border p-10`}>
            <div className="text-6xl mb-4">✅</div>
            <h2 className={`text-3xl font-bold ${t.text} mb-2`}>¡Línea completada!</h2>
            <p className={`text-sm ${t.text3} mb-2`}>{trainLine.length} movimientos · {trainErrors} error{trainErrors !== 1 ? 'es' : ''}</p>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => { setTrainStep(0); setTrainGame(new Chess()); setTrainDone(false); setTrainErrors(0); setScreen('train') }}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white"
                style={{ backgroundColor: accentColor }}
              >
                Repetir
              </button>
              <button
                onClick={() => setScreen('opening')}
                className={`flex-1 py-3 rounded-xl font-bold text-sm ${t.bg3} ${t.border} border ${t.text}`}
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className={`min-h-screen ${t.bg} flex flex-col`}>
        {/* HUD */}
        <div className={`${t.bg2} ${t.border} border-b sticky top-0 z-40`}>
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className={`text-xs uppercase tracking-widest ${t.text3} mb-0.5`}>{activeOpening?.name}</p>
                <p className={`text-lg font-bold ${t.text}`}>
                  {waitingRival ? 'Rival pensando...' : `Movimiento ${trainStep + 1} / ${trainLine.length}`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {trainErrors > 0 && (
                  <span className="text-sm px-3 py-1 rounded-full bg-red-500 bg-opacity-20 text-red-400 font-semibold">
                    {trainErrors} error{trainErrors !== 1 ? 'es' : ''}
                  </span>
                )}
                <button
                  onClick={() => setScreen('opening')}
                  className={`px-4 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-semibold ${t.text3}`}
                >
                  Salir
                </button>
              </div>
            </div>
            <div className={`h-1 ${dark ? 'bg-[#1F1F2E]' : 'bg-[#E5DFD5]'} rounded-full overflow-hidden`}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: accentColor }} />
            </div>
          </div>
        </div>

        {/* Board — directo con Chessboard, sin remount */}
        <div className="flex-1 flex items-center justify-center pt-8 px-6 pb-8">
          <div className="w-full max-w-[520px] flex flex-col items-center gap-4">
            {trainGame && (() => {
              const wrongFlashActive = false // handled via boxShadow state
              const hintStyles: Record<string, React.CSSProperties> = {}
              if (trainHintSquare) {
                hintStyles[trainHintSquare] = { background: `radial-gradient(circle, ${accentColor}99 28%, transparent 65%)` }
              }
              return (
                <div style={{ position: 'relative' }}>
                  <Chessboard
                    id="training-board"
                    boardWidth={460}
                    position={trainGame.fen()}
                    boardOrientation={color}
                    arePiecesDraggable={!waitingRival && !trainDone}
                    animationDuration={waitingRival ? 400 : 150}
                    customSquareStyles={hintStyles}
                    customBoardStyle={{
                      borderRadius: 8,
                      boxShadow: waitingRival ? 'none' : 'none',
                    }}
                    customDarkSquareStyle={{ backgroundColor: '#b58863' }}
                    customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
                    onPieceDrop={(from, to) => {
                      if (waitingRival || trainDone || !currentNode) return false
                      const g = new Chess(trainGame.fen())
                      let expected: ReturnType<typeof g.move> | null = null
                      try { expected = g.move(currentNode.move) } catch { return false }
                      if (!expected) return false
                      if (expected.from === from && expected.to === to) {
                        handleTrainSolved()
                        return true
                      } else {
                        handleTrainError()
                        return false
                      }
                    }}
                  />
                  {waitingRival && (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 8, pointerEvents: 'none', backgroundColor: 'rgba(0,0,0,0.08)' }} />
                  )}
                </div>
              )
            })()}
            {/* Pista */}
            <div className="flex items-center gap-3">
              <button
                onClick={showTrainHint}
                disabled={waitingRival || trainDone}
                className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all disabled:opacity-40 hover:scale-105 ${t.bg3} ${t.border} ${t.text2}`}
              >
                💡 Pista
              </button>
              {waitingRival && (
                <span className={`text-sm ${t.text3}`}>Rival jugando...</span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── OPENING SCREEN (árbol) ────────────────────────────────────────────────────
  if (screen === 'opening' && activeOpening) {
    const selectedNode = activeOpening.nodes.find(n => n.id === selectedNodeId)

    return (
      <div className={`min-h-screen ${t.bg} flex flex-col`}>
        <Nav />

        <div className="max-w-7xl mx-auto w-full px-6 py-8 flex-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setScreen('repertoire')}
                className={`flex items-center gap-2 text-sm font-medium ${t.text3} hover:${t.text} transition-colors`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Repertorio
              </button>
              <div className={`w-px h-4 ${t.borderLight}`} />
              <h2 className={`text-2xl font-bold ${t.text}`} style={{ letterSpacing: '-0.02em' }}>{activeOpening.name}</h2>
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${dark ? 'bg-[#1C1C28] text-[#7A776E]' : 'bg-[#EDE8DF] text-[#8A8478]'}`}>
                {color === 'white' ? '♔ Blancas' : '♚ Negras'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedNodeId && (
                <button
                  onClick={() => startPractice(selectedNodeId)}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 hover:shadow-md"
                  style={{ backgroundColor: accentColor }}
                >
                  ▶ Practicar
                </button>
              )}
            </div>
          </div>

          {/* Layout: trie (principal) + tablero derecha */}
          <div className="flex gap-4 h-[calc(100vh-260px)]">

            {/* Trie canvas — panel principal */}
            <div className={`flex-1 rounded-xl ${t.bg2} ${t.border} border overflow-hidden flex flex-col min-w-0`}>
              <div className={`px-5 py-3 border-b ${t.border} flex items-center justify-between flex-shrink-0`}>
                <div>
                  <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>Árbol de variantes</p>
                  <p className={`text-xs ${t.text3} mt-0.5`}>{activeOpening.nodes.length} mov · arrastra para navegar · scroll para zoom</p>
                </div>
                <button
                  onClick={() => {
                    const game = new Chess()
                    if (selectedNodeId) {
                      const node = activeOpening.nodes.find(n => n.id === selectedNodeId)
                      if (node) { game.load(node.fen); setAddParentId(selectedNodeId) }
                      else setAddParentId(null)
                    } else setAddParentId(null)
                    setAddGame(game); setAddMoves([]); setAddingLines(true)
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: accentColor }}
                >
                  + Agregar línea
                </button>
              </div>
              <TrieCanvas
                roots={treeRoots}
                selectedId={selectedNodeId}
                onSelect={handleSelectNode}
                t={t}
                accentColor={accentColor}
                dark={dark}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                annotations={annotations}
              />
            </div>

            {/* Panel derecho — tablero pequeño */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-3">
              <div className={`rounded-xl ${t.bg2} ${t.border} border overflow-hidden`}>
                <StaticBoard fen={selectedFen} size={272} dark={dark} />
              </div>
              {selectedNode ? (
                <>
                  <div className={`rounded-xl ${t.bg2} ${t.border} border p-4`}>
                    <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Seleccionado</p>
                    <p className={`text-base font-bold font-mono ${t.text}`}>{selectedNode.move}</p>
                    <p className={`text-xs ${t.text3} mt-0.5 mb-3`}>Mov. {selectedNode.moveNumber} · {selectedNode.color === 'white' ? 'Blancas' : 'Negras'}</p>
                    <button
                      onClick={() => startPractice(selectedNode.id)}
                      className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
                      style={{ backgroundColor: accentColor }}
                    >
                      ▶ Practicar
                    </button>
                  </div>
                  {/* Cuadro de ideas / anotación */}
                  <div className={`rounded-xl ${t.bg2} ${t.border} border overflow-hidden`}>
                    <div className={`px-4 py-2.5 border-b ${t.border}`}>
                      <p className={`text-xs uppercase tracking-widest ${t.text3}`}>Ideas de la posición</p>
                    </div>
                    <textarea
                      value={annotations[selectedNode.id]?.text ?? ''}
                      onChange={e => setAnnotations(prev => ({ ...prev, [selectedNode.id]: { ...prev[selectedNode.id], symbol: prev[selectedNode.id]?.symbol ?? '', text: e.target.value } }))}
                      placeholder="Escribe tus ideas, planes y conceptos clave..."
                      rows={4}
                      className={`w-full px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none ${t.text2} bg-transparent`}
                      style={{ fontFamily: 'inherit' }}
                    />
                  </div>
                </>
              ) : (
                <div className={`rounded-xl ${t.bg2} ${t.border} border p-4 text-center`}>
                  <p className={`text-xs ${t.text3}`}>Haz clic en un nodo del árbol para ver la posición</p>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Panel agregar líneas — tablero interactivo */}
        {addingLines && addGame && (
          <div className="fixed inset-0 z-50 flex" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
            <div className="m-auto flex gap-6 items-start max-w-5xl w-full px-4">

              {/* Tablero interactivo */}
              <div className={`rounded-2xl ${t.bg2} ${t.border} border overflow-hidden flex-shrink-0`}>
                <div className={`px-5 py-4 border-b ${t.border}`}>
                  <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>Mueve las piezas para agregar jugadas</p>
                </div>
                <div className="p-4">
                  <Chessboard
                    id="add-lines-board"
                    boardWidth={420}
                    position={addGame.fen()}
                    boardOrientation={color}
                    arePiecesDraggable={true}
                    onPieceDrop={(from, to) => {
                      try {
                        const g = new Chess()
                        g.load(addGame.fen())
                        const result = g.move({ from, to, promotion: 'q' })
                        if (!result) return false
                        const tempId = `new_${Date.now()}_${Math.random()}`
                        const lastMove = addMoves[addMoves.length - 1]
                        const newNode: ImportNode = {
                          tempId,
                          parentTempId: lastMove ? lastMove.tempId : null,
                          move: result.san,
                          fen: g.fen(),
                          moveNumber: Math.ceil(g.history().length / 2),
                          color: result.color === 'w' ? 'white' : 'black',
                          orderIndex: 0,
                        }
                        setAddMoves(prev => [...prev, newNode])
                        setAddGame(g)
                        return true
                      } catch { return false }
                    }}
                    customDarkSquareStyle={{ backgroundColor: '#b58863' }}
                    customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
                  />
                </div>
              </div>

              {/* Panel derecho: movimientos + botones */}
              <div className={`rounded-2xl ${t.bg2} ${t.border} border flex flex-col flex-shrink-0 w-64`}>
                <div className={`px-5 py-4 border-b ${t.border}`}>
                  <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>Línea</p>
                </div>

                <div className="p-4 flex-1 min-h-[80px]">
                  {addMoves.length === 0 ? (
                    <p className={`text-sm ${t.text3}`}>Mueve una pieza para empezar...</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {addMoves.map((m, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg text-sm font-mono font-bold"
                          style={{ backgroundColor: dark ? '#1C1C28' : '#E2DBD0', color: dark ? '#B8B5AC' : '#4A4640' }}
                        >
                          {m.color === 'white' ? `${m.moveNumber}.` : ''}{m.move}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className={`p-4 border-t ${t.border} flex flex-col gap-2`}>
                  {addMoves.length > 0 && (
                    <button
                      onClick={() => {
                        if (addMoves.length === 0) return
                        const prev = addMoves[addMoves.length - 2]
                        const fen = prev ? prev.fen : (addParentId
                          ? activeOpening?.nodes.find(n => n.id === addParentId)?.fen ?? INITIAL_FEN
                          : INITIAL_FEN)
                        const g = new Chess()
                        g.load(fen)
                        setAddGame(g)
                        setAddMoves(ms => ms.slice(0, -1))
                      }}
                      className={`w-full py-2.5 rounded-xl text-sm font-bold border ${t.border} ${t.text2} transition-all hover:${t.text}`}
                    >
                      ↩ Deshacer
                    </button>
                  )}
                  <button
                    onClick={saveAddedLines}
                    disabled={addMoves.length === 0 || loading}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50 transition-all hover:opacity-90"
                    style={{ backgroundColor: accentColor }}
                  >
                    {loading ? 'Guardando...' : '✓ Guardar línea'}
                  </button>
                  <button
                    onClick={() => { setAddingLines(false); setAddMoves([]) }}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold ${t.bg3} ${t.border} border ${t.text}`}
                  >
                    Cancelar
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    )
  }

  // ── REPERTOIRE SCREEN ─────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${t.bg}`}>
      <Nav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>Repertorio de aperturas</p>
          <h2 className={`text-5xl font-bold ${t.text} leading-none mb-8`} style={{ letterSpacing: '-0.02em' }}>
            Aperturas ♟
          </h2>

          {/* Tabs color */}
          <div className={`inline-flex rounded-xl ${t.bg2} ${t.border} border p-1 gap-1`}>
            {(['white', 'black'] as Color[]).map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
                style={color === c ? { backgroundColor: accentColor, color: 'white' } : {}}
              >
                <span className={color === c ? 'text-white' : t.text2}>
                  {c === 'white' ? '♔ Blancas' : '♚ Negras'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between mb-6">
          <p className={`text-lg font-bold ${t.text}`}>
            {openings.length} apertura{openings.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={() => setShowImport(true)}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 hover:scale-105"
            style={{ backgroundColor: accentColor }}
          >
            + Añadir apertura
          </button>
        </div>

        {/* Lista de aperturas */}
        {loading ? (
          <p className={`text-center py-20 ${t.text3}`}>Cargando...</p>
        ) : openings.length === 0 ? (
          <div className={`text-center py-20 rounded-xl ${t.bg2} ${t.border} border`}>
            <p className="text-4xl mb-4">♟</p>
            <p className={`text-lg ${t.text2} mb-2`}>Sin aperturas aún</p>
            <p className={`text-sm ${t.text3} mb-6`}>Añade tu primera apertura manualmente o importa un PGN</p>
            <button
              onClick={() => setShowImport(true)}
              className="px-6 py-3 rounded-xl font-bold text-sm text-white"
              style={{ backgroundColor: accentColor }}
            >
              + Añadir apertura
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {openings.map(op => (
              <div
                key={op.id}
                className={`rounded-xl ${t.bg2} ${t.border} border p-5 flex items-center justify-between transition-all hover:shadow-lg hover:-translate-y-0.5`}
              >
                {renamingId === op.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        await renameOpening(op.id, renameValue)
                        setRenamingId(null)
                        await loadRepertoire(color)
                      }
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold mr-4 ${t.inputBg} ${t.border} focus:outline-none`}
                  />
                ) : (
                  <button
                    onClick={() => loadOpening(op.id)}
                    className="flex-1 text-left"
                  >
                    <h3 className={`font-bold ${t.text} text-lg`}>{op.name}</h3>
                    <p className={`text-xs ${t.text3} mt-1`}>Creada {new Date(op.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </button>
                )}

                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <button
                    onClick={() => { setRenamingId(op.id); setRenameValue(op.name) }}
                    className={`p-2 rounded-lg ${t.bg3} ${t.border} border text-xs font-semibold ${t.text3} hover:${t.text} transition-colors`}
                    title="Renombrar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`¿Eliminar "${op.name}"?`)) {
                        await deleteOpening(op.id)
                        await loadRepertoire(color)
                      }
                    }}
                    className="p-2 rounded-lg bg-red-500 bg-opacity-10 border border-red-500 border-opacity-20 text-xs text-red-400 hover:bg-opacity-20 transition-colors"
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                  <button
                    onClick={() => loadOpening(op.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold text-white`}
                    style={{ backgroundColor: accentColor }}
                  >
                    Abrir →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal importar PGN */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 px-4">
          <div className={`w-full max-w-2xl rounded-2xl ${t.bg2} ${t.border} border p-8`}>
            <h3 className={`text-2xl font-bold ${t.text} mb-6`}>Añadir apertura</h3>

            {/* Tabs: Manual / PGN */}
            <div className={`flex rounded-xl overflow-hidden border ${t.border} mb-6`}>
              {(['manual', 'pgn'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setImportMode(m)}
                  className={`flex-1 py-3 text-sm font-bold transition-all`}
                  style={importMode === m
                    ? { backgroundColor: accentColor, color: '#000' }
                    : {}
                  }
                >
                  {m === 'manual' ? '✏️ Crear manualmente' : '📄 Importar PGN'}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {/* Nombre siempre visible */}
              <div>
                <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-2`}>Nombre de la apertura</label>
                <input
                  type="text"
                  value={importName}
                  onChange={e => setImportName(e.target.value)}
                  placeholder="ej. Sistema Londres"
                  className={`w-full px-4 py-3 rounded-xl border focus:outline-none font-semibold ${t.inputBg} ${t.border}`}
                />
              </div>

              {importMode === 'manual' ? (
                <div className={`rounded-xl ${t.bg3} ${t.border} border px-5 py-4`}>
                  <p className={`text-sm ${t.text2} leading-relaxed`}>
                    Se creará una apertura vacía. Podrás añadir jugadas directamente desde el tablero interactivo.
                  </p>
                </div>
              ) : (
                <>
                  {/* Pegar PGN */}
                  <div>
                    <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-2`}>Pegar PGN</label>
                    <textarea
                      value={importPgn}
                      onChange={e => setImportPgn(e.target.value)}
                      placeholder="1.d4 d5 2.Bf4 Nf6 3.e3 e6 (3...c5 4.c3) *"
                      rows={6}
                      className={`w-full px-4 py-3 rounded-xl border focus:outline-none font-mono text-sm resize-none ${t.inputBg} ${t.border}`}
                    />
                  </div>
                  {/* O subir archivo */}
                  <div>
                    <label className={`block text-xs uppercase tracking-widest ${t.text3} font-semibold mb-2`}>O cargar archivo .pgn</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pgn,text/plain"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => {
                          setImportPgn(ev.target?.result as string ?? '')
                          if (!importName.trim()) setImportName(file.name.replace(/\.pgn$/i, ''))
                        }
                        reader.readAsText(file)
                        e.target.value = ''
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-full py-3 rounded-xl border-2 border-dashed ${t.border} text-sm font-semibold ${t.text3} hover:${t.text} transition-all`}
                    >
                      📂 Seleccionar archivo .pgn
                    </button>
                    {importPgn && (
                      <p className="text-xs mt-1" style={{ color: accentColor }}>
                        ✓ PGN cargado ({importPgn.length} caracteres)
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {importError && (
              <div className="mt-4 px-4 py-3 rounded-xl border text-sm font-semibold" style={{ backgroundColor: 'rgba(231,76,60,0.08)', borderColor: 'rgba(231,76,60,0.3)', color: '#E74C3C' }}>
                {importError}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={importMode === 'manual' ? async () => {
                  if (!importName.trim()) { setImportError('El nombre es requerido'); return }
                  setImporting(true); setImportError(null)
                  try {
                    const result = await createOpening({ color, name: importName.trim(), nodes: [] })
                    setImportName(''); setShowImport(false)
                    await loadRepertoire(color)
                    // Navigate directly to opening and start adding moves
                    await loadOpening(result.openingId)
                    const game = new Chess()
                    setAddParentId(null)
                    setAddGame(game)
                    setAddMoves([])
                    setAddingLines(true)
                  } catch (e: unknown) { setImportError((e as Error).message) }
                  finally { setImporting(false) }
                } : handleImport}
                disabled={importing}
                className="flex-1 py-4 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                {importing ? 'Guardando...' : importMode === 'manual' ? 'Crear apertura' : 'Importar'}
              </button>
              <button
                onClick={() => { setShowImport(false); setImportError(null); setImportPgn(''); setImportName('') }}
                className={`flex-1 py-4 rounded-xl font-bold text-sm ${t.bg3} ${t.border} border ${t.text}`}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`${t.bg2} ${t.border} border-t mt-16`}>
        <div className="max-w-7xl mx-auto px-6 py-6 flex justify-end">
          <button onClick={logout} className={`px-5 py-2 rounded-lg ${t.bg3} ${t.border} border text-sm font-medium ${t.text3} hover:${t.text} transition-all`}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── STATIC BOARD ─────────────────────────────────────────────────────────────

function StaticBoard({ fen, size, dark }: { fen: string; size: number; dark: boolean }) {
  const squareSize = size / 8
  const game = new Chess()
  try { game.load(fen) } catch {}
  const board = game.board()

  const pieceImages: Record<string, string> = {
    wK: '/pieces/wK.svg', wQ: '/pieces/wQ.svg', wR: '/pieces/wR.svg',
    wB: '/pieces/wB.svg', wN: '/pieces/wN.svg', wP: '/pieces/wP.svg',
    bK: '/pieces/bK.svg', bQ: '/pieces/bQ.svg', bR: '/pieces/bR.svg',
    bB: '/pieces/bB.svg', bN: '/pieces/bN.svg', bP: '/pieces/bP.svg',
  }

  return (
    <div style={{ width: size, height: size, display: 'grid', gridTemplateColumns: `repeat(8, ${squareSize}px)`, borderRadius: 8, overflow: 'hidden' }}>
      {board.map((row, rankIdx) =>
        row.map((square, fileIdx) => {
          const isDark = (rankIdx + fileIdx) % 2 === 1
          const key = square ? `${square.color}${square.type.toUpperCase()}` : null
          return (
            <div
              key={`${rankIdx}-${fileIdx}`}
              style={{ width: squareSize, height: squareSize, backgroundColor: isDark ? '#b58863' : '#f0d9b5', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {key && (
                <img src={pieceImages[key]} alt={key} style={{ width: squareSize * 0.85, height: squareSize * 0.85 }} />
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
