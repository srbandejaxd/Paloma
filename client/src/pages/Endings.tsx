import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { useAuth } from '../lib/auth'

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
  { path: '/endings',     label: 'Finales',   icon: '♚' },
]

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

interface EndingItem { title: string; pgn: string }
interface Chapter { title: string; endings: EndingItem[] }

interface EndNode {
  id: number
  parentId: number | null
  move: string
  fen: string
  moveNumber: number
  color: 'white' | 'black'
  orderIndex: number
  annotationText: string
  annotationSymbol: string
  children: EndNode[]
}

// ─── PGN PARSER (adapted from Openings) ───────────────────────────────────────
const NAG_TO_SYMBOL: Record<number, string> = {
  1: '!', 2: '?', 3: '!!', 4: '??', 5: '!?', 6: '?!',
  10: '=', 13: '∞', 14: '±', 15: '∓', 16: '⩲', 17: '⩱',
  18: '+−', 19: '+-', 20: '-+',
}

function parsePgnToNodes(pgn: string): { nodes: { tempId: string; parentTempId: string | null; move: string; fen: string; moveNumber: number; color: 'white' | 'black'; orderIndex: number }[]; annotationMap: Map<string, { text: string; symbol: string }> } {
  let tempIdCounter = 0
  function nextId() { return `n${tempIdCounter++}` }
  const dedupeMap = new Map<string, string>()
  const nodes: any[] = []
  const annotationMap = new Map<string, { text: string; symbol: string }>()
  const nodeMap = new Map<string, { parentTempId: string | null; parentFen: string }>()

  function tokenizeGame(text: string): string[] {
    const tokens: string[] = []
    let i = 0
    let buf = ''
    function flushBuf() { if (buf.trim()) { tokens.push(...buf.trim().split(/\s+/).filter(Boolean)); buf = '' } }
    while (i < text.length) {
      const ch = text[i]
      if (ch === '{') {
        flushBuf()
        let comment = ''
        i++
        while (i < text.length && text[i] !== '}') { comment += text[i]; i++ }
        const cleaned = comment.replace(/\[%csl[^\]]*\]/g, '').replace(/\[%cal[^\]]*\]/g, '').replace(/_[JTN]/g, '').trim()
        if (cleaned) tokens.push(`{${cleaned}}`)
      } else if (ch === '(' || ch === ')') {
        flushBuf(); tokens.push(ch)
      } else { buf += ch }
      i++
    }
    flushBuf()
    return tokens
  }

  function parseVariation(tokens: string[], idx: number, parentTempId: string | null, game: Chess, orderIndex: number): { idx: number; lastId: string | null } {
    let lastId = parentTempId
    let firstMove = true
    while (idx < tokens.length) {
      const token = tokens[idx]
      if (token === ')') return { idx, lastId }
      if (token === '(') {
        let parentOfLast: string | null
        let fenForBranch: string
        if (lastId !== null && nodeMap.has(lastId)) {
          const meta = nodeMap.get(lastId)!
          parentOfLast = meta.parentTempId
          fenForBranch = meta.parentFen
        } else {
          parentOfLast = null
          fenForBranch = game.fen()
        }
        const result = parseVariation(tokens, idx + 1, parentOfLast, new Chess(fenForBranch), 0)
        idx = result.idx + 1
        continue
      }
      if (token.startsWith('{') && token.endsWith('}')) {
        if (lastId !== null) {
          const text = token.slice(1, -1).trim()
          const existing = annotationMap.get(lastId) ?? { text: '', symbol: '' }
          annotationMap.set(lastId, { ...existing, text: existing.text ? `${existing.text}\n${text}` : text })
        }
        idx++; continue
      }
      if (/^\$\d+$/.test(token)) {
        if (lastId !== null) {
          const sym = NAG_TO_SYMBOL[parseInt(token.slice(1))]
          if (sym) {
            const existing = annotationMap.get(lastId) ?? { text: '', symbol: '' }
            if (!existing.symbol) annotationMap.set(lastId, { ...existing, symbol: sym })
          }
        }
        idx++; continue
      }
      if (/^\d+\.\.\.?\.?/.test(token) || ['*', '1-0', '0-1', '1/2-1/2'].includes(token)) { idx++; continue }
      const sanMatch = token.match(/^(.+?)(!!|\?\?|!\?|\?!|!|\?)?$/)
      const cleanSan = sanMatch?.[1] ?? token
      const sanSuffix = sanMatch?.[2] ?? null
      try {
        const fenBeforeMove = game.fen()
        const moveResult = game.move(cleanSan)
        if (moveResult) {
          const fen = game.fen()
          const dedupeKey = `${lastId ?? 'root'}|${fen}`
          let id: string
          if (dedupeMap.has(dedupeKey)) {
            id = dedupeMap.get(dedupeKey)!
          } else {
            id = nextId()
            dedupeMap.set(dedupeKey, id)
            const thisOrder = firstMove ? orderIndex : 0
            nodeMap.set(id, { parentTempId: lastId, parentFen: fenBeforeMove })
            nodes.push({ tempId: id, parentTempId: lastId, move: moveResult.san, fen, moveNumber: parseInt(game.fen().split(' ')[5]), color: moveResult.color === 'w' ? 'white' : 'black', orderIndex: thisOrder })
          }
          if (sanSuffix) {
            const existing = annotationMap.get(id) ?? { text: '', symbol: '' }
            if (!existing.symbol) annotationMap.set(id, { ...existing, symbol: sanSuffix })
          }
          lastId = id
          firstMove = false
        }
      } catch {}
      idx++
    }
    return { idx, lastId }
  }

  const games = pgn.replace(/\r\n/g, '\n').split(/(?=\[Event )/).map(s => s.trim()).filter(Boolean)
  for (const gameText of games) {
    const fenMatch = gameText.match(/\[FEN "([^"]*)"\]/)
    const cleaned = gameText.replace(/\[[^\]]*\]/g, '').trim()
    if (!cleaned || cleaned === '*') continue
    const tokens = tokenizeGame(cleaned)
    const startGame = fenMatch ? new Chess(fenMatch[1]) : new Chess()
    parseVariation(tokens, 0, null, startGame, 0)
  }
  return { nodes, annotationMap }
}

function buildTree(nodes: { id: number; parentId: number | null; move: string; fen: string; moveNumber: number; color: 'white' | 'black'; orderIndex: number; annotationText: string; annotationSymbol: string }[]): EndNode[] {
  const map = new Map<number, EndNode>()
  const roots: EndNode[] = []
  for (const n of nodes) map.set(n.id, { ...n, children: [] })
  for (const n of nodes) {
    const node = map.get(n.id)!
    if (n.parentId === null) roots.push(node)
    else { const parent = map.get(n.parentId); if (parent) parent.children.push(node) }
  }
  function sortChildren(node: EndNode) { node.children.sort((a, b) => a.orderIndex - b.orderIndex); node.children.forEach(sortChildren) }
  roots.sort((a, b) => a.orderIndex - b.orderIndex)
  roots.forEach(sortChildren)
  return roots
}

// ─── chapter parsing ──────────────────────────────────────────────────────────
function parsePgnToChapters(text: string): Chapter[] {
  const parts = text.replace(/\r\n/g, '\n').split(/(?=\[Event )/).map(s => s.trim()).filter(Boolean)
  const map = new Map<string, EndingItem[]>()
  const order: string[] = []
  for (const p of parts) {
    const st = p.match(/\[SourceTitle "([^"]*)"\]/)?.[1] ?? 'Sin capítulo'
    const white = p.match(/\[White "([^"]*)"\]/)?.[1] ?? ''
    const black = p.match(/\[Black "([^"]*)"\]/)?.[1] ?? ''
    const title = ([white, black].filter(v => v && v !== '?').join(' ').trim()) || (p.match(/\[Event "([^"]*)"\]/)?.[1] ?? 'Final')
    if (!map.has(st)) { map.set(st, []); order.push(st) }
    map.get(st)!.push({ title, pgn: p })
  }
  return order.map(t => ({ title: t, endings: map.get(t)! }))
}

function SunIcon() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>) }
function MoonIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>) }

function normalizeComment(text: string): string {
  let t = (text || '').replace(/\s+/g, ' ').trim()
  t = t.replace(/(\S)(\d+\))/g, '$1 $2')
  t = t.replace(/vs\. /gi, 'vs.\u00A0')
  t = t.replace(/\. /g, '.\n')
  t = t.replace(/\n /g, '\n')
  t = t.replace(/ (\d+\))/g, '\n$1')
  t = t.replace(/vs\.\u00A0/g, 'vs. ')
  t = t.replace(/\n{2,}/g, '\n')
  return t
}

function evaluateBoard(g: Chess): number {
  const pieceVal: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
  let score = 0
  for (const row of g.board()) {
    for (const sq of row) {
      if (!sq) continue
      const v = pieceVal[sq.type] || 0
      score += sq.color === 'w' ? v : -v
    }
  }
  // mobility
  score += (g.moves().length) * 0.05 * (g.turn() === 'w' ? 1 : -1)
  return score
}

function minimax(g: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (depth === 0 || g.isGameOver()) {
    if (g.isCheckmate()) return maximizing ? -100000 : 100000
    return evaluateBoard(g)
  }
  const moves = g.moves()
  if (maximizing) {
    let best = -Infinity
    for (const m of moves) {
      g.move(m)
      best = Math.max(best, minimax(g, depth - 1, alpha, beta, false))
      g.undo()
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  } else {
    let best = Infinity
    for (const m of moves) {
      g.move(m)
      best = Math.min(best, minimax(g, depth - 1, alpha, beta, true))
      g.undo()
      beta = Math.min(beta, best)
      if (beta <= alpha) break
    }
    return best
  }
}

function bestMoveForBlack(g: Chess): string | null {
  const moves = g.moves()
  if (moves.length === 0) return null
  let best = Infinity
  let chosen: string | null = null
  for (const m of moves) {
    g.move(m)
    const score = minimax(g, 4, -Infinity, Infinity, true)
    g.undo()
    if (score < best) { best = score; chosen = m }
  }
  return chosen
}

function bestMoveForSide(g: Chess, side: 'white' | 'black'): string | null {
  const moves = g.moves()
  if (moves.length === 0) return null
  if (side === 'black') return bestMoveForBlack(g)
  // white: maximize
  let best = -Infinity
  let chosen: string | null = null
  for (const m of moves) {
    g.move(m)
    const score = minimax(g, 4, -Infinity, Infinity, false)
    g.undo()
    if (score > best) { best = score; chosen = m }
  }
  return chosen
}

function getBestMove(fen: string): Promise<string | null> {
  return new Promise((resolve) => {
    let worker: Worker
    try { worker = new Worker('/stockfish/stockfish-19-lite-single.js') } catch { resolve(null); return }
    const timeout = setTimeout(() => { try { worker.terminate() } catch {} ; resolve(null) }, 15000)
    worker.onmessage = (e) => {
      const line = String(e.data || '')
      if (line === 'uciok') {
        worker.postMessage('isready')
      } else if (line === 'readyok') {
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage('go depth 12')
      } else if (line.startsWith('bestmove')) {
        clearTimeout(timeout)
        const m = line.match(/bestmove (\S+)/)
        try { worker.terminate() } catch {}
        resolve(m ? m[1] : null)
      }
    }
    worker.onerror = () => { clearTimeout(timeout); try { worker.terminate() } catch {} ; resolve(null) }
    worker.postMessage('uci')
  })
}

export default function Endings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [dark, setDark] = useState(true)
  const [screen, setScreen] = useState<'intro' | 'list' | 'historial'>('intro')
  const [tab, setTab] = useState<'teoria' | 'practica'>('teoria')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set())
  const [selectedEnding, setSelectedEnding] = useState<EndingItem | null>(null)

  // viewer state
  const [roots, setRoots] = useState<EndNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [startFen, setStartFen] = useState(INITIAL_FEN)
  const [practiceStartFen, setPracticeStartFen] = useState(INITIAL_FEN)
  const [introComment, setIntroComment] = useState('')
  const [mode, setMode] = useState<'estudiar' | 'jugar'>('estudiar')
  const [showComment, setShowComment] = useState(false)
  const [studying, setStudying] = useState(false)
  const [playGame, setPlayGame] = useState<Chess | null>(null)
  const [playFen, setPlayFen] = useState('')
  const [userColor, setUserColor] = useState<'white' | 'black'>('white')
  const [timer, setTimer] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [attempts, setAttempts] = useState<{ title: string; result: string; time: number; date: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem('endings_history') || '[]') } catch { return [] }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState<string | null>(null)
  const [histChapter, setHistChapter] = useState<string>('')
  const [histEnding, setHistEnding] = useState<string>('')
  const [histPosition, setHistPosition] = useState<string>('')
  const [showAllPositions, setShowAllPositions] = useState(false)
  const [practiceIntroComment, setPracticeIntroComment] = useState('')
  const [selectedFen, setSelectedFen] = useState(INITIAL_FEN)
  const [nodeMap, setNodeMap] = useState<Map<number, EndNode>>(new Map())

  // practice
  const [practicePgn, setPracticePgn] = useState('')
  const [practiceChapters, setPracticeChapters] = useState<Chapter[]>([])
  const [practiceOpen, setPracticeOpen] = useState<Set<string>>(new Set())
  const [practiceSelected, setPracticeSelected] = useState<EndingItem | null>(null)
  const [practiceRoots, setPracticeRoots] = useState<EndNode[]>([])
  const [practiceSelectedNodeId, setPracticeSelectedNodeId] = useState<number | null>(null)
  const [practiceSelectedFen, setPracticeSelectedFen] = useState(INITIAL_FEN)
  const [practiceNodeMap, setPracticeNodeMap] = useState<Map<number, EndNode>>(new Map())

  useEffect(() => { const saved = localStorage.getItem('wp_theme'); if (saved) setDark(saved === 'dark') }, [])
  useEffect(() => {
    if (!timerRunning) return
    const id = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [timerRunning])
  function toggleTheme() { const next = !dark; setDark(next); localStorage.setItem('wp_theme', next ? 'dark' : 'light') }

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetch('/endings.pgn').then(r => r.text()).then(text => setChapters(parsePgnToChapters(text))).catch(() => {})
  }, [user, navigate])

  function loadEnding(ending: EndingItem, practice: boolean) {
    if (timerRunning) recordResult('derrota')
    setStudying(false)
    const fenMatch = ending.pgn.match(/\[FEN "([^"]*)"\]/)
    const sf = fenMatch ? fenMatch[1] : INITIAL_FEN
    const introMatch = ending.pgn.replace(/\[[^\]]*\]/g, '').trim().match(/^\s*\{([^}]*)\}/)
    const ic = introMatch ? introMatch[1].trim() : ''
    const { nodes: impNodes, annotationMap } = parsePgnToNodes(ending.pgn)
    const idMap = new Map<string, number>()
    let counter = 1
    for (const n of impNodes) { if (!idMap.has(n.tempId)) idMap.set(n.tempId, counter++) }
    const nodes = impNodes.map(n => ({
      id: idMap.get(n.tempId)!,
      parentId: n.parentTempId ? (idMap.get(n.parentTempId) ?? null) : null,
      move: n.move,
      fen: n.fen,
      moveNumber: n.moveNumber,
      color: n.color,
      orderIndex: n.orderIndex,
      annotationText: annotationMap.get(n.tempId)?.text ?? '',
      annotationSymbol: annotationMap.get(n.tempId)?.symbol ?? '',
    }))
    const r = buildTree(nodes)
    const nm = new Map<number, EndNode>()
    function collect(ns: EndNode[]) { for (const n of ns) { nm.set(n.id, n); collect(n.children) } }
    collect(r)
    if (practice) {
      setPracticeSelected(ending)
      setPracticeRoots(r)
      setPracticeSelectedNodeId(null)
      setPracticeSelectedFen(sf)
      setPracticeNodeMap(nm)
      setPracticeStartFen(sf)
      setPracticeIntroComment(ic)
    } else {
      setSelectedEnding(ending)
      setRoots(r)
      setSelectedNodeId(null)
      setSelectedFen(sf)
      setNodeMap(nm)
      setStartFen(sf)
      setIntroComment(ic)
    }
  }

  function initPlay(sf: string) {
    const g = new Chess(sf)
    const uc: 'white' | 'black' = g.turn() === 'w' ? 'white' : 'black'
    setUserColor(uc)
    setPlayGame(g)
    setPlayFen(sf)
    setTimer(0)
    setTimerRunning(true)
    const mc: 'white' | 'black' = uc === 'white' ? 'black' : 'white'
    if (g.turn() === (mc === 'white' ? 'w' : 'b')) {
      setTimeout(() => {
        getBestMove(g.fen()).then((bm) => {
          if (bm) {
            const gg = new Chess(g.fen())
            try { gg.move(bm) } catch {}
            setPlayGame(gg); setPlayFen(gg.fen())
            if (gg.isGameOver()) setTimerRunning(false)
          }
        })
      }, 400)
    }
  }

  function handlePlayDrop(sourceSquare: string, targetSquare: string): boolean {
    if (!playGame) return false
    const g = new Chess(playGame.fen())
    const turnColor: 'white' | 'black' = g.turn() === 'w' ? 'white' : 'black'
    if (turnColor !== userColor) return false
    let move
    try { move = g.move({ from: sourceSquare, to: targetSquare, promotion: 'q' }) } catch { move = null }
    if (!move) return false
    setPlayGame(g)
    setPlayFen(g.fen())
    if (g.isGameOver()) { setTimerRunning(false); return true }
    const mc: 'white' | 'black' = userColor === 'white' ? 'black' : 'white'
    setTimeout(() => {
      const gg = new Chess(g.fen())
      if (gg.turn() === (mc === 'white' ? 'w' : 'b')) {
        getBestMove(gg.fen()).then((bm) => {
          if (bm) {
            const ggg = new Chess(gg.fen())
            try { ggg.move(bm) } catch {}
            setPlayGame(ggg); setPlayFen(ggg.fen())
            if (ggg.isGameOver()) setTimerRunning(false)
          }
        })
      }
    }, 400)
    return true
  }

  function recordResult(result: 'victoria' | 'derrota' | 'reintentar') {
    setTimerRunning(false)
    const title = selectedEnding?.title || ''
    const entry = { title, result: result === 'reintentar' ? 'derrota' : result, time: timer, date: new Date().toLocaleString() }
    const next = [entry, ...attempts]
    setAttempts(next)
    try { localStorage.setItem('endings_history', JSON.stringify(next)) } catch {}
    if (result === 'reintentar' && selectedEnding) {
      initPlay(startFen)
    }
  }

  function toggleChapter(title: string, practice = false) {
    const setter = practice ? setPracticeOpen : setOpenChapters
    setter(prev => { const next = new Set(prev); next.has(title) ? next.delete(title) : next.add(title); return next })
  }

  function parsePractice() { setPracticeChapters(parsePgnToChapters(practicePgn)) }

  const t = dark ? { bg:'bg-[#0A0A0F]', bg2:'bg-[#12121A]', bg3:'bg-[#1C1C28]', border:'border-[#1F1F2E]', borderLight:'border-[#2A2A3A]', text:'text-[#E8E6E0]', text2:'text-[#B8B5AC]', text3:'text-[#7A776E]', inputBg:'bg-[#12121A] border-[#1F1F2E] text-[#E8E6E0]' }
    : { bg:'bg-[#FAFAF7]', bg2:'bg-[#F3EFE7]', bg3:'bg-[#EDE8DF]', border:'border-[#E5DFD5]', borderLight:'border-[#D9D2C8]', text:'text-[#1A1814]', text2:'text-[#4A4640]', text3:'text-[#8A8478]', inputBg:'bg-[#F3EFE7] border-[#E5DFD5] text-[#1A1814]' }
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
            <button onClick={toggleTheme} className={`flex items-center justify-center w-10 h-10 rounded-lg ${t.bg3} ${t.border} border transition-all hover:scale-105 ${t.text3}`}>{dark ? <SunIcon /> : <MoonIcon />}</button>
          </div>
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {NAV_ITEMS.map((item, idx) => {
              const isActive = location.pathname === item.path
              return (
                <div key={item.path} className="flex items-center">
                  <button onClick={() => navigate(item.path)} className={`px-4 py-2 flex items-center gap-2 text-sm font-medium transition-all relative group ${isActive ? t.text : `${t.text2} hover:${t.text}`}`}>
                    <span className="text-lg">{item.icon}</span><span className="whitespace-nowrap">{item.label}</span>
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

  // render move tree recursively
  function getMovePrefix(n: EndNode): string {
    if (n.color === 'white') return `${n.moveNumber}.`
    const parent = n.parentId != null ? nodeMap.get(n.parentId) ?? null : null
    if (!parent || parent.color === 'black') return `${n.moveNumber}...`
    return ''
  }

  function collectLines(startNodes: EndNode[]): { depth: number; nodes: EndNode[] }[] {
    const lines: { depth: number; nodes: EndNode[] }[] = []
    function walk(nodes: EndNode[], depth: number) {
      // main line following first child
      const line: EndNode[] = []
      let cur: EndNode | null = nodes[0] ?? null
      // if multiple roots, handle each
      // We'll process each root node as start of a line
    }
    // Handle possibly multiple roots
    function buildLine(node: EndNode, depth: number) {
      const line: EndNode[] = []
      let cur: EndNode | null = node
      while (cur) {
        line.push(cur)
        cur = cur.children[0] ?? null
      }
      lines.push({ depth, nodes: line })
      for (const n of line) {
        for (let i = 1; i < n.children.length; i++) {
          buildLine(n.children[i], depth + 1)
        }
      }
    }
    for (const r of startNodes) buildLine(r, 0)
    return lines
  }

  function renderMoveLines(startNodes: EndNode[], selectedId: number | null, onSelect: (id: number | null) => void, nodeMap: Map<number, EndNode>): JSX.Element {
    const lines = collectLines(startNodes)
    return (
      <div className="space-y-2">
        {lines.map((line, li) => (
          <div key={li} style={{ marginLeft: line.depth * 14, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', borderLeft: line.depth > 0 ? `2px solid ${dark ? '#38385A' : '#C4BBAA'}` : 'none', paddingLeft: line.depth > 0 ? 8 : 0 }}>
            {line.nodes.map(n => (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className={`px-2 py-1 rounded text-sm font-mono transition-all ${selectedId === n.id ? 'bg-[#D4A017] text-black' : `${t.bg3} ${t.text2} hover:${t.text}`}`}
              >
                {getMovePrefix(n)} {n.move}{n.annotationSymbol ? ` ${n.annotationSymbol}` : ''}
              </button>
            ))}
          </div>
        ))}
      </div>
    )
  }

  function Viewer({ roots, selectedId, selectedFen, nodeMap, onSelect, onPrevEnding, onNextEnding, startFen, introComment }: {
    roots: EndNode[]; selectedId: number | null; selectedFen: string; nodeMap: Map<number, EndNode>;
    onSelect: (id: number | null) => void; onPrevEnding: () => void; onNextEnding: () => void; startFen: string; introComment: string;
  }) {
    const node = selectedId != null ? nodeMap.get(selectedId) ?? null : null
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className={`${t.bg2} ${t.border} border rounded p-4`}>
          <div className="aspect-square max-w-[420px] mx-auto">
            <Chessboard position={selectedFen} boardOrientation="white" />
          </div>
          <div className="flex gap-2 mt-3 justify-center">
            <button onClick={onPrevEnding} className={`px-3 py-1.5 rounded ${t.bg3} ${t.border} border ${t.text2}`}>◀</button>
            <button onClick={() => { onSelect(null) }} className={`px-3 py-1.5 rounded ${t.bg3} ${t.border} border ${t.text2}`}>Inicio</button>
            <button onClick={onNextEnding} className={`px-3 py-1.5 rounded ${t.bg3} ${t.border} border ${t.text2}`}>▶</button>
          </div>
          <p className={`text-sm ${t.text} font-bold text-center mt-1`}>Juegan {selectedFen.split(' ')[1] === 'w' ? 'blancas' : 'negras'}</p>
        </div>
        <div className={`${t.bg2} ${t.border} border rounded p-4`}>
          <h3 className={`font-bold mb-2 ${t.text}`}>{node ? `${getMovePrefix(node)} ${node.move} ${node.annotationSymbol}`.trim() : 'Posición inicial'}</h3>
          <div className={`text-sm ${t.text2} whitespace-pre-wrap mb-4`}>{normalizeComment(node ? (node.annotationText || 'Sin comentario') : '')}</div>
          <div>{renderMoveLines(roots, selectedId, onSelect, nodeMap)}</div>
        </div>
      </div>
    )
  }

  const renderChapterList = (chs: Chapter[], openSet: Set<string>, selected: EndingItem | null, onSelectEnding: (e: EndingItem) => void, onToggle: (t: string) => void, practice: boolean) => (
    <div className="space-y-2">
      {chs.map(ch => (
        <div key={ch.title} className={`${t.bg2} ${t.border} border rounded`}>
          <button onClick={() => onToggle(ch.title)} className={`w-full text-left px-4 py-3 font-semibold ${t.text} flex justify-between`}>
            <span>{ch.title}</span><span>{openSet.has(ch.title) ? '▾' : '▸'}</span>
          </button>
          {openSet.has(ch.title) && (
            <div className="px-4 pb-3 space-y-1">
              {ch.endings.map((e, i) => (
                <button key={i} onClick={() => { onSelectEnding(e); loadEnding(e, practice) }} className={`block w-full text-left text-sm px-3 py-1.5 rounded ${selected?.title === e.title && selected?.pgn === e.pgn ? t.bg3 : ''} ${t.text2} hover:${t.text}`}>
                  {e.title}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  // navigation helpers
  function prevNode(roots: EndNode[], selectedId: number | null, nodeMap: Map<number, EndNode>, setSelectedId: (id: number | null) => void, setSelectedFen: (f: string) => void) {
    if (selectedId == null) return
    const node = nodeMap.get(selectedId)
    if (!node) return
    if (node.parentId == null) { setSelectedId(null); setSelectedFen(INITIAL_FEN) }
    else {
      const parent = nodeMap.get(node.parentId)
      setSelectedId(node.parentId)
      setSelectedFen(parent ? parent.fen : INITIAL_FEN)
    }
  }
  function nextNode(roots: EndNode[], selectedId: number | null, nodeMap: Map<number, EndNode>, setSelectedId: (id: number | null) => void, setSelectedFen: (f: string) => void) {
    if (selectedId == null) {
      if (roots.length > 0) { setSelectedId(roots[0].id); setSelectedFen(roots[0].fen) }
      return
    }
    const node = nodeMap.get(selectedId)
    if (node && node.children.length > 0) {
      setSelectedId(node.children[0].id)
      setSelectedFen(node.children[0].fen)
    }
  }

  if (screen === 'intro') {
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300 flex flex-col`}>
        <Nav />
        <div className="max-w-3xl mx-auto px-6 py-20">
          <div className="mb-12">
            <p className={`text-sm uppercase tracking-[0.15em] ${t.text3} mb-3`}>100 Finales que hay que saber</p>
            <h2 className={`text-5xl font-bold ${t.text} leading-none mb-6`} style={{ letterSpacing: '-0.02em' }}>
              Finales ♚
            </h2>
            <p className={`text-lg ${t.text2} leading-relaxed max-w-xl`}>
              Estudia los finales esenciales del ajedrez: posiciones clave con comentarios y variantes. Teoría para leerlos y Práctica para dominarlos.
            </p>
          </div>
          <div className={`rounded-xl ${t.bg2} ${t.border} border p-8 mb-6`}>
            <p className={`text-xs uppercase tracking-widest ${t.text3} font-semibold mb-6`}>Cómo funciona</p>
            <div className="space-y-6">
              {[
                { icon: '📖', title: 'Teoría', desc: 'Explora capítulos y finales. Cada posición incluye comentarios y variantes.' },
                { icon: '♟', title: 'Tablero', desc: 'Visualiza la posición y navega por los movimientos con las flechas.' },
                { icon: '💬', title: 'Comentarios', desc: 'Los comentarios se normalizan para leerse con claridad.' },
                { icon: '➡️', title: 'Navegación', desc: 'Usa las flechas para pasar de un final al siguiente.' },
              ].map(step => (
                <div key={step.title} className="flex gap-4">
                  <div className="text-2xl flex-shrink-0 mt-0.5">{step.icon}</div>
                  <div>
                    <p className={`font-bold ${t.text} mb-1`}>{step.title}</p>
                    <p className={`text-sm ${t.text2} leading-relaxed`}>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => setScreen('list')}
            className="px-10 py-4 rounded-xl font-bold text-sm tracking-widest uppercase text-white transition-all hover:opacity-90 hover:shadow-lg hover:scale-105"
            style={{ backgroundColor: accentColor }}
          >
            Ver finales
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'historial') {
    const chapterList = chapters.map(c => c.title)
    const endingsInChapter = histChapter ? (chapters.find(c => c.title === histChapter)?.endings || []) : []
    const endingTitles = endingsInChapter.map(e => e.title)
    const selectedEndingObj = endingsInChapter.find(e => e.title === histEnding)
    const positions = histEnding ? endingsInChapter.filter(e => e.title === histEnding) : endingsInChapter
    const visiblePositions = showAllPositions ? endingsInChapter : positions
    return (
      <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300 flex flex-col`}>
        <Nav />
        <div className="max-w-5xl mx-auto px-6 py-8 w-full">
          <button onClick={() => setScreen('list')} className={`mb-4 flex items-center gap-2 text-sm ${t.text3} hover:${t.text}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Volver
          </button>
          <h2 className={`text-2xl font-bold mb-4 ${t.text}`}>Historial de Finales</h2>
          <div className="flex gap-3 mb-4 flex-wrap">
            <select value={histChapter} onChange={e => { setHistChapter(e.target.value); setHistEnding(''); setHistPosition(''); setShowAllPositions(false) }} className={`${t.bg3} ${t.border} border rounded px-3 py-2 text-sm`}>
              <option value="">Capítulo</option>
              {chapterList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={histEnding} onChange={e => { setHistEnding(e.target.value); setHistPosition('') }} className={`${t.bg3} ${t.border} border rounded px-3 py-2 text-sm`} disabled={!histChapter}>
              <option value="">Ending</option>
              {endingTitles.map(tl => <option key={tl} value={tl}>{tl}</option>)}
            </select>
          </div>
          <button onClick={() => setShowAllPositions(v => !v)} className={`mb-4 px-4 py-2 rounded text-sm ${t.bg3} ${t.border} border ${t.text2}`}>{showAllPositions ? 'Ocultar todos' : 'Mostrar todos los positions'}</button>
          <div className="space-y-2">
            {visiblePositions.map(e => {
              const atts = attempts.filter(a => a.title === e.title)
              const correct = atts.filter(a => a.result === 'victoria').length
              const prec = atts.length ? Math.round((correct / atts.length) * 100) : 0
              const isOpen = historyExpanded === e.title
              return (
                <div key={e.title} className={`${t.bg2} ${t.border} border rounded`}>
                  <button onClick={() => setHistoryExpanded(isOpen ? null : e.title)} className={`w-full text-left px-4 py-3 flex justify-between ${t.text}`}>
                    <span className="font-semibold">{e.title}</span>
                    <span className={`text-sm font-bold ${prec >= 50 ? 'text-green-500' : 'text-red-500'}`}>{atts.length} intentos · {prec}%</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 space-y-2">
                      {atts.length === 0 ? <p className={t.text3}>Sin intentos</p> : atts.map((a, i) => (
                        <div key={i} className={`flex items-center justify-between rounded-lg ${t.bg3} px-3 py-2`}>
                          <span className={`text-base font-bold ${a.result === 'victoria' ? 'text-green-500' : 'text-red-500'}`}>{a.result === 'victoria' ? '✓ Victoria' : '✗ Derrota'}</span>
                          <span className={`text-sm ${t.text2}`}>{a.time}s</span>
                          <span className={`text-xs ${t.text3}`}>{a.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} transition-colors duration-300 flex flex-col`}>
      <Nav />
      <div className="flex-1 px-6 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h2 className={`text-2xl font-bold mb-4 ${t.text}`}>♚ Finales</h2>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('teoria')} className={`px-4 py-2 rounded ${tab === 'teoria' ? 'text-black' : t.bg3}`} style={tab === 'teoria' ? { backgroundColor: accentColor } : {}}>Teoría</button>
          <button onClick={() => setTab('practica')} className={`px-4 py-2 rounded ${tab === 'practica' ? 'text-black' : t.bg3}`} style={tab === 'practica' ? { backgroundColor: accentColor } : {}}>Práctica</button>
           <button onClick={() => setScreen('historial')} className={`px-4 py-2 rounded text-sm ${t.bg3} ${t.border} border ${t.text2}`}>Historial</button>
        </div>
        {tab === 'teoria' && (
          selectedEnding ? (
            <div>
              <button onClick={() => { if (timerRunning) recordResult('derrota'); setSelectedEnding(null); setRoots([]); setSelectedNodeId(null); setSelectedFen(startFen); setMode('estudiar'); setShowComment(false) }} className={`mb-4 flex items-center gap-2 text-sm ${t.text3} hover:${t.text}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Volver
              </button>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xl font-bold ${t.text}`}>{selectedEnding.title}</h3>
                <div className="flex gap-2">
                  <button onClick={() => { setMode('estudiar'); setStudying(true) }} className={`px-3 py-1.5 rounded text-sm ${mode === 'estudiar' ? 'text-black' : t.bg3}`} style={mode === 'estudiar' ? { backgroundColor: accentColor } : {}}>Estudiar</button>
                  <button onClick={() => { setMode('jugar'); setStudying(false); initPlay(startFen) }} className={`px-3 py-1.5 rounded text-sm ${mode === 'jugar' ? 'text-black' : t.bg3}`} style={mode === 'jugar' ? { backgroundColor: accentColor } : {}}>Jugar</button>
                </div>
              </div>
               {studying && introComment && <div className={`${t.bg3} ${t.border} border rounded p-3 mb-4 text-sm ${t.text} whitespace-pre-wrap`}>{normalizeComment(introComment)}</div>}
              {mode === 'estudiar' ? (
                studying ? (
                  <Viewer roots={roots} selectedId={selectedNodeId} selectedFen={selectedFen} nodeMap={nodeMap} startFen={startFen} onSelect={(id) => { setSelectedNodeId(id); setSelectedFen(id != null ? (nodeMap.get(id)?.fen ?? startFen) : startFen) }} onPrevEnding={() => { const flat = chapters.flatMap(c => c.endings); const idx = flat.findIndex(e => e.title === selectedEnding?.title && e.pgn === selectedEnding?.pgn); if (idx > 0) loadEnding(flat[idx-1], false) }} onNextEnding={() => { const flat = chapters.flatMap(c => c.endings); const idx = flat.findIndex(e => e.title === selectedEnding?.title && e.pgn === selectedEnding?.pgn); if (idx >= 0 && idx < flat.length - 1) loadEnding(flat[idx+1], false) }} introComment={introComment} />
                ) : (
                  <div>
                    <div className={`${t.bg2} ${t.border} border rounded p-4 max-w-[420px]`}>
                      <Chessboard position={startFen} boardOrientation="white" />
                      <p className={`text-sm ${t.text} font-bold text-center mt-2`}>Juegan {startFen.split(' ')[1] === 'w' ? 'blancas' : 'negras'}</p>
                    </div>
                    <p className={`${t.text3} mt-3`}>Pulsa Estudiar o Jugar para comenzar</p>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div className={`${t.bg2} ${t.border} border rounded p-4`}>
                    <div className="aspect-square max-w-[420px] mx-auto">
                      <Chessboard position={playFen || startFen} boardOrientation={userColor} onPieceDrop={handlePlayDrop} />
                      <p className={`text-sm ${t.text} font-bold text-center mt-2`}>Juegan {playGame && playGame.turn() === 'w' ? 'blancas' : 'negras'}</p>
                    </div>
                    <div className="flex gap-2 mt-3 justify-center">
                      <span className={`text-sm ${t.text2}`}>⏱ {timer}s</span>
                    </div>
                    <div className="flex gap-2 mt-3 justify-center">
                      <button onClick={() => recordResult('victoria')} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm">Victoria</button>
                      <button onClick={() => recordResult('derrota')} className="px-3 py-1.5 rounded bg-red-600 text-white text-sm">Derrota</button>
                      <button onClick={() => recordResult('reintentar')} className="px-3 py-1.5 rounded bg-yellow-600 text-white text-sm">Reintentar</button>
                    </div>
                  </div>
                  <div className={`${t.bg2} ${t.border} border rounded p-4`}>
                    <p className={`${t.text3} text-sm`}>Modo Jugar: juegas con blancas. Las negras responden automáticamente.</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-2xl">{renderChapterList(chapters, openChapters, selectedEnding, (e) => {}, (tt) => toggleChapter(tt, false), false)}</div>
          )
        )}
        {tab === 'practica' && (
          practiceSelected ? (
            <div>
              <button onClick={() => { if (timerRunning) recordResult('derrota'); setPracticeSelected(null); setPracticeRoots([]); setPracticeSelectedNodeId(null); setPracticeSelectedFen(practiceStartFen); setMode('estudiar'); setShowComment(false) }} className={`mb-4 flex items-center gap-2 text-sm ${t.text3} hover:${t.text}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Volver
              </button>
              <h3 className={`text-xl font-bold mb-4 ${t.text}`}>{practiceSelected.title}</h3>
               {practiceIntroComment && <div className={`${t.bg3} ${t.border} border rounded p-3 mb-4 text-sm ${t.text} whitespace-pre-wrap`}>{normalizeComment(practiceIntroComment)}</div>}
              <Viewer roots={practiceRoots} selectedId={practiceSelectedNodeId} selectedFen={practiceSelectedFen} nodeMap={practiceNodeMap} startFen={practiceStartFen} onSelect={(id) => { setPracticeSelectedNodeId(id); setPracticeSelectedFen(id != null ? (practiceNodeMap.get(id)?.fen ?? practiceStartFen) : practiceStartFen) }} onPrevEnding={() => { const flat = practiceChapters.flatMap(c => c.endings); const idx = flat.findIndex(e => e.title === practiceSelected?.title && e.pgn === practiceSelected?.pgn); if (idx > 0) loadEnding(flat[idx-1], true) }} onNextEnding={() => { const flat = practiceChapters.flatMap(c => c.endings); const idx = flat.findIndex(e => e.title === practiceSelected?.title && e.pgn === practiceSelected?.pgn); if (idx >= 0 && idx < flat.length - 1) loadEnding(flat[idx+1], true) }} introComment={practiceIntroComment} />
            </div>
          ) : (
            <div>
              <textarea value={practicePgn} onChange={e => setPracticePgn(e.target.value)} className={`w-full h-32 ${t.inputBg} border rounded p-3 text-sm`} placeholder="Pega aquí el PGN del workbook" />
              <button onClick={parsePractice} className="mt-2 px-4 py-2 rounded text-black" style={{ backgroundColor: accentColor }}>Cargar</button>
              <div className="mt-4 max-w-2xl">{renderChapterList(practiceChapters, practiceOpen, practiceSelected, (e) => {}, (tt) => toggleChapter(tt, true), true)}</div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
