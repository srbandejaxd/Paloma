import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Chess } from 'chess.js'
import { useAuth } from '../lib/auth'
import {
  fetchRepertoire, createOpening, fetchOpeningTree, addOpeningNodes,
  renameOpening, deleteOpening,
  Opening, OpeningNode, OpeningTree, ImportNode
} from '../lib/api'
import { Chessboard } from 'react-chessboard'

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

type Screen = 'repertoire' | 'opening' | 'train'
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

// ─── TRIE RENDERER ────────────────────────────────────────────────────────────

function TrieRenderer({
  roots, selectedId, onSelect, t, accentColor, dark
}: {
  roots: TreeNode[]
  selectedId: number | null
  onSelect: (node: TreeNode) => void
  t: Record<string, string>
  accentColor: string
  dark: boolean
}) {
  const borderCol = dark ? '#2A2A3A' : '#D4CABF'
  const chipBg    = dark ? '#1C1C28' : '#E2DBD0'

  function NodeBtn({ node, showNum }: { node: TreeNode; showNum: boolean }) {
    const isSelected = node.id === selectedId
    const piece = node.move.match(/^([KQRBN])/)?.[1]
    const symbol = piece ? PIECE_SYMBOLS[piece] : null
    const moveText = piece ? node.move.slice(1) : node.move
    const isWhite = node.color === 'white'
    return (
      <span className="inline-flex items-center gap-0.5 flex-shrink-0">
        {(isWhite || showNum) && (
          <span className={`text-xs font-mono ${t.text3} mr-0.5 flex-shrink-0`}>
            {node.moveNumber}{!isWhite ? '...' : '.'}
          </span>
        )}
        <button
          onClick={() => onSelect(node)}
          className="inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-sm font-mono font-bold transition-all flex-shrink-0 hover:scale-105"
          style={{
            backgroundColor: isSelected ? accentColor : chipBg,
            color: isSelected ? (dark ? '#000' : '#fff') : (dark ? '#B8B5AC' : '#4A4640'),
            boxShadow: isSelected ? `0 2px 12px ${accentColor}55` : 'none',
          }}
        >
          {symbol && <span className="text-base leading-none">{symbol}</span>}
          <span>{moveText}</span>
        </button>
      </span>
    )
  }

  function renderNode(node: TreeNode, showNum: boolean, isVariation: boolean): React.ReactNode {
    const mainChild = node.children[0]
    const variations = node.children.slice(1)
    const hasBranch = node.children.length > 1

    return (
      <span key={node.id}>
        <NodeBtn node={node} showNum={showNum} />

        {/* Main line continues inline */}
        {mainChild && !hasBranch && (
          <span className="inline"> {renderNode(mainChild, false, false)}</span>
        )}

        {/* Branch point — main line + variations in block */}
        {hasBranch && (
          <span className="inline-block w-full mt-1">
            {/* Main line */}
            <span className="flex flex-wrap items-center gap-0.5 mb-1">
              <span className="text-xs mr-1" style={{ color: borderCol }}>├─</span>
              {renderNode(mainChild, true, false)}
            </span>
            {/* Variations */}
            {variations.map((v) => (
              <span key={v.id} className="flex flex-wrap items-start gap-0.5 mb-1 pl-4" style={{ borderLeft: `2px solid ${borderCol}` }}>
                <span className="text-xs mr-1" style={{ color: borderCol }}>╰─</span>
                {renderNode(v, true, true)}
              </span>
            ))}
          </span>
        )}

        {/* Single-child variations that still need to be shown as new block if coming from variation */}
        {isVariation && !hasBranch && mainChild && (
          <span className="inline"> {renderNode(mainChild, false, true)}</span>
        )}
      </span>
    )
  }

  if (roots.length === 0) return (
    <div className={`text-center py-12 ${t.text3} text-sm`}>
      Sin movimientos.<br/>Agrega una línea para comenzar.
    </div>
  )

  return (
    <div className="p-4 space-y-3">
      {roots.map(root => (
        <div key={root.id} className="flex flex-wrap items-start gap-0.5 leading-8">
          {renderNode(root, true, false)}
        </div>
      ))}
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
    setScreen('train')
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

    // Crear puzzle sintético para PuzzleBoard
    const syntheticPuzzle = currentNode ? {
      id: currentNode.id,
      fen: trainGame?.fen() || currentNode.fen,
      solution: [currentNode.move],
      blockId: 0,
      orderInBlock: 0,
    } : null

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

        {/* Board */}
        <div className="flex-1 flex items-start justify-center pt-8 px-6">
          <div className="w-full max-w-[520px]">
            {syntheticPuzzle && !waitingRival && (
              <PuzzleBoard
                key={`${currentNode.id}-${trainStep}`}
                puzzle={syntheticPuzzle}
                onSolved={handleTrainSolved}
                onError={handleTrainError}
                autoSkipAfterErrors={0}
              />
            )}
            {waitingRival && trainGame && (
              <div className={`rounded-xl ${t.bg2} ${t.border} border p-6 text-center`}>
                <p className={`text-sm ${t.text3}`}>Rival jugando...</p>
              </div>
            )}
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
                  onClick={() => startTraining(selectedNodeId)}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 hover:shadow-md"
                  style={{ backgroundColor: accentColor }}
                >
                  ▶ Entrenar hasta aquí
                </button>
              )}
            </div>
          </div>

          {/* Layout: árbol + tablero */}
          <div className="flex gap-6 h-[calc(100vh-280px)]">
            {/* Trie — panel principal */}
            <div className={`flex-1 rounded-xl ${t.bg2} ${t.border} border overflow-hidden flex flex-col min-w-0`}>
              <div className={`px-5 py-4 border-b ${t.border} flex items-center justify-between flex-shrink-0`}>
                <div>
                  <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold`}>Árbol de variantes</p>
                  <p className={`text-xs ${t.text3} mt-0.5`}>{activeOpening.nodes.length} movimientos</p>
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
              <div className="flex-1 overflow-y-auto">
                <TrieRenderer
                  roots={treeRoots}
                  selectedId={selectedNodeId}
                  onSelect={handleSelectNode}
                  t={t}
                  accentColor={accentColor}
                  dark={dark}
                />
              </div>
            </div>

            {/* Tablero + acciones */}
            <div className="flex-1 flex flex-col gap-4">
              {/* Tablero */}
              <div className={`rounded-xl ${t.bg2} ${t.border} border overflow-hidden flex-shrink-0`}>
                {/* Mini board estático */}
                <div className="flex items-center justify-center p-4">
                  <StaticBoard fen={selectedFen} size={480} dark={dark} />
                </div>
              </div>

              {/* Info del nodo seleccionado */}
              {selectedNode && (
                <div className={`rounded-xl ${t.bg2} ${t.border} border p-5`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs uppercase tracking-widest ${t.text3} mb-1`}>Posición seleccionada</p>
                      <p className={`text-lg font-bold font-mono ${t.text}`}>{selectedNode.move}</p>
                      <p className={`text-xs ${t.text3} mt-1`}>Movimiento {selectedNode.moveNumber} · {selectedNode.color === 'white' ? 'Blancas' : 'Negras'}</p>
                    </div>
                    <button
                      onClick={() => startTraining(selectedNode.id)}
                      className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 hover:scale-105"
                      style={{ backgroundColor: accentColor }}
                    >
                      ▶ Entrenar hasta aquí
                    </button>
                  </div>
                </div>
              )}

              {!selectedNodeId && (
                <div className={`rounded-xl ${t.bg2} ${t.border} border p-5 text-center`}>
                  <p className={`text-sm ${t.text3}`}>Selecciona un movimiento del árbol para ver la posición y entrenar</p>
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
