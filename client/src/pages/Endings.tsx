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

export default function Endings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [dark, setDark] = useState(true)
  const [tab, setTab] = useState<'teoria' | 'practica'>('teoria')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set())
  const [selectedEnding, setSelectedEnding] = useState<EndingItem | null>(null)

  // viewer state
  const [roots, setRoots] = useState<EndNode[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [startFen, setStartFen] = useState(INITIAL_FEN)
  const [selectedFen, setSelectedFen] = useState(INITIAL_FEN)
  const [nodeMap, setNodeMap] = useState<Map<number, EndNode>>(new Map())

  // practice
  const [practicePgn, setPracticePgn] = useState('')
  const [practiceChapters, setPracticeChapters] = useState<Chapter[]>([])
  const [practiceOpen, setPracticeOpen] = useState<Set<string>>(new Set())
  const [practiceSelected, setPracticeSelected] = useState<EndingItem | null>(null)
  const [practiceRoots, setPracticeRoots] = useState<EndNode[]>([])
  const [practiceSelectedNodeId, setPracticeSelectedNodeId] = useState<number | null>(null)
  const [practiceStartFen, setPracticeStartFen] = useState(INITIAL_FEN)
  const [practiceSelectedFen, setPracticeSelectedFen] = useState(INITIAL_FEN)
  const [practiceNodeMap, setPracticeNodeMap] = useState<Map<number, EndNode>>(new Map())

  useEffect(() => { const saved = localStorage.getItem('wp_theme'); if (saved) setDark(saved === 'dark') }, [])
  function toggleTheme() { const next = !dark; setDark(next); localStorage.setItem('wp_theme', next ? 'dark' : 'light') }

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetch('/endings.pgn').then(r => r.text()).then(text => setChapters(parsePgnToChapters(text))).catch(() => {})
  }, [user, navigate])

  function loadEnding(ending: EndingItem, practice: boolean) {
    const fenMatch = ending.pgn.match(/\[FEN "([^"]*)"\]/)
    const sf = fenMatch ? fenMatch[1] : INITIAL_FEN
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
    } else {
      setSelectedEnding(ending)
      setRoots(r)
      setSelectedNodeId(null)
      setSelectedFen(sf)
      setNodeMap(nm)
      setStartFen(sf)
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
  function renderMoveTree(nodes: EndNode[], selectedId: number | null, onSelect: (id: number | null) => void, depth = 0): JSX.Element[] {
    return nodes.map(n => (
      <span key={n.id} style={{ marginLeft: depth * 12 }}>
        <button
          onClick={() => onSelect(n.id)}
          className={`inline-block px-2 py-0.5 rounded text-sm font-mono mx-1 ${selectedId === n.id ? 'bg-[#D4A017] text-black' : `${t.text2} hover:${t.text}`}`}
        >
          {n.moveNumber}. {n.move}{n.annotationSymbol ? ` ${n.annotationSymbol}` : ''}
        </button>
        {n.children.length > 0 && renderMoveTree(n.children, selectedId, onSelect, depth + 1)}
      </span>
    ))
  }

  function Viewer({ roots, selectedId, selectedFen, nodeMap, onSelect, onPrev, onNext }: {
    roots: EndNode[]; selectedId: number | null; selectedFen: string; nodeMap: Map<number, EndNode>;
    onSelect: (id: number | null) => void; onPrev: () => void; onNext: () => void;
  }) {
    const node = selectedId != null ? nodeMap.get(selectedId) ?? null : null
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className={`${t.bg2} ${t.border} border rounded p-4`}>
          <div className="aspect-square max-w-[420px] mx-auto">
            <Chessboard position={selectedFen} boardOrientation="white" />
          </div>
          <div className="flex gap-2 mt-3 justify-center">
            <button onClick={onPrev} className={`px-3 py-1.5 rounded ${t.bg3} ${t.border} border ${t.text2}`}>◀</button>
            <button onClick={() => onSelect(null)} className={`px-3 py-1.5 rounded ${t.bg3} ${t.border} border ${t.text2}`}>Inicio</button>
            <button onClick={onNext} className={`px-3 py-1.5 rounded ${t.bg3} ${t.border} border ${t.text2}`}>▶</button>
          </div>
        </div>
        <div className={`${t.bg2} ${t.border} border rounded p-4`}>
          <h3 className={`font-bold mb-2 ${t.text}`}>{node ? `${node.moveNumber}. ${node.move} ${node.annotationSymbol}` : 'Posición inicial'}</h3>
          <div className={`text-sm ${t.text2} whitespace-pre-wrap mb-4`}>{node ? (node.annotationText || 'Sin comentario') : ''}</div>
          <div className="flex flex-wrap gap-1">{renderMoveTree(roots, selectedId, onSelect)}</div>
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

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono transition-colors duration-300 flex flex-col`}>
      <Nav />
      <div className="flex-1 px-6 pt-6 pb-6 max-w-7xl mx-auto w-full">
        <h2 className={`text-2xl font-bold mb-4 ${t.text}`}>♚ Finales</h2>
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab('teoria')} className={`px-4 py-2 rounded ${tab === 'teoria' ? 'text-black' : t.bg3}`} style={tab === 'teoria' ? { backgroundColor: accentColor } : {}}>Teoría</button>
          <button onClick={() => setTab('practica')} className={`px-4 py-2 rounded ${tab === 'practica' ? 'text-black' : t.bg3}`} style={tab === 'practica' ? { backgroundColor: accentColor } : {}}>Práctica</button>
        </div>
        {tab === 'teoria' && (
          selectedEnding ? (
            <div>
              <button onClick={() => { setSelectedEnding(null); setRoots([]); setSelectedNodeId(null); setSelectedFen(startFen) }} className={`mb-4 flex items-center gap-2 text-sm ${t.text3} hover:${t.text}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Volver
              </button>
              <h3 className={`text-xl font-bold mb-4 ${t.text}`}>{selectedEnding.title}</h3>
              <Viewer roots={roots} selectedId={selectedNodeId} selectedFen={selectedFen} nodeMap={nodeMap} onSelect={(id) => { setSelectedNodeId(id); setSelectedFen(id != null ? (nodeMap.get(id)?.fen ?? startFen) : startFen) }} onPrev={() => { if (selectedNodeId == null) return; const node = nodeMap.get(selectedNodeId); if (!node || node.parentId == null) { setSelectedNodeId(null); setSelectedFen(startFen) } else { setSelectedNodeId(node.parentId); setSelectedFen(nodeMap.get(node.parentId)?.fen ?? startFen) } }} onNext={() => { if (selectedNodeId == null) { if (roots.length > 0) { setSelectedNodeId(roots[0].id); setSelectedFen(roots[0].fen) } return } const node = nodeMap.get(selectedNodeId); if (node && node.children.length > 0) { setSelectedNodeId(node.children[0].id); setSelectedFen(node.children[0].fen) } }} />
            </div>
          ) : (
            <div className="max-w-2xl">{renderChapterList(chapters, openChapters, selectedEnding, (e) => {}, (tt) => toggleChapter(tt, false), false)}</div>
          )
        )}
        {tab === 'practica' && (
          practiceSelected ? (
            <div>
              <button onClick={() => { setPracticeSelected(null); setPracticeRoots([]); setPracticeSelectedNodeId(null); setPracticeSelectedFen(practiceStartFen) }} className={`mb-4 flex items-center gap-2 text-sm ${t.text3} hover:${t.text}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Volver
              </button>
              <h3 className={`text-xl font-bold mb-4 ${t.text}`}>{practiceSelected.title}</h3>
              <Viewer roots={practiceRoots} selectedId={practiceSelectedNodeId} selectedFen={practiceSelectedFen} nodeMap={practiceNodeMap} onSelect={(id) => { setPracticeSelectedNodeId(id); setPracticeSelectedFen(id != null ? (practiceNodeMap.get(id)?.fen ?? practiceStartFen) : practiceStartFen) }} onPrev={() => { if (practiceSelectedNodeId == null) return; const node = practiceNodeMap.get(practiceSelectedNodeId); if (!node || node.parentId == null) { setPracticeSelectedNodeId(null); setPracticeSelectedFen(practiceStartFen) } else { setPracticeSelectedNodeId(node.parentId); setPracticeSelectedFen(practiceNodeMap.get(node.parentId)?.fen ?? practiceStartFen) } }} onNext={() => { if (practiceSelectedNodeId == null) { if (practiceRoots.length > 0) { setPracticeSelectedNodeId(practiceRoots[0].id); setPracticeSelectedFen(practiceRoots[0].fen) } return } const node = practiceNodeMap.get(practiceSelectedNodeId); if (node && node.children.length > 0) { setPracticeSelectedNodeId(node.children[0].id); setPracticeSelectedFen(node.children[0].fen) } }} />
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
