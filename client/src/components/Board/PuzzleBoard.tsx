import { useState, useEffect, useCallback, useRef } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { Puzzle } from '../../types'

interface PuzzleBoardProps {
  puzzle: Puzzle
  onSolved: (timeMs: number, errors: number) => void
  onError?: () => void
  onSkip?: (errors: number) => void
  disabled?: boolean
  onMoveCorrect?: () => void
  autoSkipAfterErrors?: number
  externalHighlights?: string[]
  onStepChange?: (step: number) => void
}

type FeedbackState = 'idle' | 'correct' | 'wrong' | 'opponent' | 'skipping'

const moveSound = new Audio('/sounds/move.mp3')
const captureSound = new Audio('/sounds/capture.mp3')
const correctSound = new Audio('/sounds/correct.mp3')
const errorSound = new Audio('/sounds/error.mp3')
moveSound.preload = 'auto'
captureSound.preload = 'auto'
correctSound.preload = 'auto'
errorSound.preload = 'auto'

const OPPONENT_ANIM_MS = 500

// Preload all piece images so the drag ghost never flashes on first use
const PIECE_CODES = ['wP','wN','wB','wR','wQ','wK','bP','bN','bB','bR','bQ','bK']
PIECE_CODES.forEach(code => {
  const img = new Image()
  img.src = `/pieces/${code}.svg`
})

function moveFromSAN(game: Chess, san: string): { from: string; to: string; promotion?: string } | null {
  try {
    const result = game.move(san)
    if (!result) return null
    game.undo()
    return { from: result.from, to: result.to, promotion: result.promotion }
  } catch { return null }
}

function useBoardSize() {
  const [size, setSize] = useState(480)
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (vw < 640) setSize(Math.min(vw - 32, 480))
      else {
        const available = Math.min(vw * 0.5, vh - 180)
        setSize(Math.min(Math.max(available, 320), 680))
      }
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])
  return size
}

function pixelToSquare(x: number, y: number, boardSize: number, orientation: 'white' | 'black'): string | null {
  const col = Math.floor(x / (boardSize / 8))
  const row = Math.floor(y / (boardSize / 8))
  if (col < 0 || col > 7 || row < 0 || row > 7) return null
  const file = orientation === 'white' ? col : 7 - col
  const rank = orientation === 'white' ? 7 - row : row
  return 'abcdefgh'[file] + (rank + 1)
}

export default function PuzzleBoard({
  puzzle,
  onSolved,
  onError,
  onMoveCorrect,
  onSkip,
  disabled,
  autoSkipAfterErrors = 1,
  externalHighlights = [],
  onStepChange,
}: PuzzleBoardProps) {
  const [game, setGame] = useState(new Chess())
  const [displayFen, setDisplayFen] = useState('')
  const [feedback, setFeedback] = useState<FeedbackState>('idle')
  const [solutionIndex, setSolutionIndex] = useState(0)
  const [errors, setErrors] = useState(0)
  const [highlightSquares, setHighlightSquares] = useState<Record<string, { background: string }>>({})
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [draggedSquare, setDraggedSquare] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [dragPiece, setDragPiece] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string; piece: string } | null>(null)

  const startTimeRef = useRef<number>(Date.now())
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>()
  const errorsRef = useRef(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const mouseDownSquareRef = useRef<string | null>(null)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const selectedSquareRef = useRef<string | null>(null)
  const gameRef = useRef<Chess>(new Chess())
  const feedbackRef = useRef<FeedbackState>('idle')
  const dragPieceRef = useRef<string | null>(null)
  useEffect(() => { errorsRef.current = errors }, [errors])
  useEffect(() => { selectedSquareRef.current = selectedSquare }, [selectedSquare])
  useEffect(() => { feedbackRef.current = feedback }, [feedback])
  useEffect(() => { dragPieceRef.current = dragPiece }, [dragPiece])
  useEffect(() => { gameRef.current = game }, [game])

  const boardSize = useBoardSize()
  const boardSizeRef = useRef(boardSize)
  useEffect(() => { boardSizeRef.current = boardSize }, [boardSize])

  const playerColor = (() => {
    const parts = puzzle.fen.split(' ')
    return parts[1] === 'w' ? 'white' : 'black'
  })()
  const playerColorRef = useRef(playerColor)
  useEffect(() => { playerColorRef.current = playerColor }, [playerColor])

  const boardOrientation = playerColor

  // ── Window-level mouse events (captura mouseUp aunque esté fuera del board) ─
  useEffect(() => {
    function getSquareFromEvent(e: MouseEvent): string | null {
      if (!boardRef.current) return null
      const rect = boardRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      return pixelToSquare(x, y, boardSizeRef.current, playerColorRef.current as 'white' | 'black')
    }

    function onWindowMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current) return
      setDragPos({ x: e.clientX, y: e.clientY })
    }

    function onWindowMouseUp(e: MouseEvent) {
      const downSq = mouseDownSquareRef.current
      const wasDragging = isDraggingRef.current

      isDraggingRef.current = false
      mouseDownSquareRef.current = null
      mouseDownPosRef.current = null

      if (wasDragging) {
        setIsDragging(false)
        setDraggedSquare(null)
        setDragPos(null)
        if (!downSq || !dragPieceRef.current) return
        const upSq = getSquareFromEvent(e)
        if (upSq && upSq !== downSq) {
          processMoveRef.current(downSq, upSq, dragPieceRef.current)
        }
        return
      }

      // Click simple sin arrastre real: la selección (click-to-move) ya se
      // armó en mouseDown, así que no hay que hacer nada más aquí. Permanece
      // activa hasta que se toque una casilla destino u otra pieza.
      // Pero sí limpiamos el estado visual de drag para no dejar la imagen flotante.
      setIsDragging(false)
      setDragPos(null)
    }

    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
    }
  }, [])

  useEffect(() => {
    const newGame = new Chess()
    try { newGame.load(puzzle.fen) } catch { console.error('Invalid FEN:', puzzle.fen) }
    setGame(newGame)
    gameRef.current = newGame
    setDisplayFen(newGame.fen())
    setSolutionIndex(0)
    setErrors(0)
    errorsRef.current = 0
    setFeedback('idle')
    feedbackRef.current = 'idle'
    setHighlightSquares({})
    setSelectedSquare(null)
    selectedSquareRef.current = null
    setDraggedSquare(null)
    setDragPos(null)
    setDragPiece(null)
    setIsDragging(false)
    isDraggingRef.current = false
    startTimeRef.current = Date.now()
  }, [puzzle])

  const solutionIndexRef = useRef(0)
  useEffect(() => { solutionIndexRef.current = solutionIndex; onStepChange?.(solutionIndex) }, [solutionIndex, onStepChange])

  const playOpponentMove = useCallback(
    (currentGame: Chess, currentIndex: number) => {
      const nextIndex = currentIndex + 1
      if (nextIndex >= puzzle.solution.length) {
        const elapsed = Date.now() - startTimeRef.current
        setTimeout(() => onSolved(elapsed, errorsRef.current), 150)
        return
      }
      const opponentSAN = puzzle.solution[nextIndex]
      const gameCopy = new Chess()
      gameCopy.loadPgn(currentGame.pgn())
      const moveResult = gameCopy.move(opponentSAN)
      if (!moveResult) return

      if (moveResult.captured) { captureSound.currentTime = 0; captureSound.play() }
      else { moveSound.currentTime = 0; moveSound.play() }

      // Actualizar juego lógico inmediatamente (para que isOwnPiece etc. sean correctos)
      setGame(gameCopy)
      gameRef.current = gameCopy

      setHighlightSquares({
        [moveResult.from]: { background: 'rgba(212,160,23,0.25)' },
        [moveResult.to]: { background: 'rgba(212,160,23,0.4)' },
      })

      setTimeout(() => {
        setDisplayFen(gameCopy.fen())
      }, 50)

      const nextPlayerIndex = nextIndex + 1
      setSolutionIndex(nextPlayerIndex)
      solutionIndexRef.current = nextPlayerIndex
      setFeedback('idle')
      feedbackRef.current = 'idle'

      if (nextPlayerIndex >= puzzle.solution.length) {
        const elapsed = Date.now() - startTimeRef.current
        // puzzle ends on opponent's move — board plays correct sound
        correctSound.currentTime = 0; correctSound.play().catch(() => {})
        setTimeout(() => onSolved(elapsed, errorsRef.current), OPPONENT_ANIM_MS + 50)
      }
    },
    [puzzle.solution, onSolved]
  )

  function isOwnPiece(square: string, g?: Chess): boolean {
    const chess = g || gameRef.current
    const p = chess.get(square as any)
    return !!p && (playerColorRef.current === 'white' ? p.color === 'w' : p.color === 'b')
  }

  function highlightMoves(square: string) {
    const moves = gameRef.current.moves({ square: square as any, verbose: true })
    const highlights: Record<string, { background: string }> = {
      [square]: { background: 'rgba(212,160,23,0.5)' },
    }
    moves.forEach((m: any) => {
      const hasEnemy = !!gameRef.current.get(m.to as any)
      highlights[m.to] = hasEnemy
        ? { background: 'radial-gradient(circle, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 78%, rgba(80,150,80,0.6) 78%, rgba(80,150,80,0.6) 100%)' }
        : { background: 'radial-gradient(circle, rgba(80,150,80,0.5) 20%, transparent 20%)' }
    })
    setHighlightSquares(highlights)
  }

  // Ref para processMove para evitar stale closure en window events
  const processMoveRef = useRef<(src: string, tgt: string, piece: string) => boolean>(() => false)

  function processMove(sourceSquare: string, targetSquare: string, piece: string, promotionPiece?: string): boolean {
    if (disabled || feedbackRef.current === 'opponent' || feedbackRef.current === 'skipping') return false

    const currentGame = gameRef.current
    const currentSolutionIndex = solutionIndexRef.current
    const expectedSAN = puzzle.solution[currentSolutionIndex]
    const gameCopy = new Chess()
    gameCopy.loadPgn(currentGame.pgn())

    let moveResult
    try {
      const isPromotion = piece.toLowerCase().includes('p') &&
        (targetSquare[1] === '8' || targetSquare[1] === '1')
      if (isPromotion && !promotionPiece) {
        setPromotionMove({ from: sourceSquare, to: targetSquare, piece })
        return false
      }
      moveResult = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: promotionPiece })
    } catch { return false }

    if (!moveResult) return false

    const expectedMove = moveFromSAN(new Chess(currentGame.fen()), expectedSAN)
    const isCorrect = expectedMove &&
      expectedMove.from === moveResult.from &&
      expectedMove.to === moveResult.to

    setSelectedSquare(null)
    selectedSquareRef.current = null

    if (isCorrect) {
      if (moveResult.captured) { captureSound.currentTime = 0; captureSound.play() }
      else { moveSound.currentTime = 0; moveSound.play() }
      onMoveCorrect?.()
      setHighlightSquares({
        [moveResult.from]: { background: 'rgba(46,204,113,0.25)' },
        [moveResult.to]: { background: 'rgba(46,204,113,0.4)' },
      })
      setGame(gameCopy)
      gameRef.current = gameCopy
      setDisplayFen(gameCopy.fen())

      const isLastPlayerMove = currentSolutionIndex + 1 >= puzzle.solution.length
      if (isLastPlayerMove) {
        // Play correct sound immediately — same instant as the green flash
        correctSound.currentTime = 0; correctSound.play().catch(() => {})
        setFeedback('correct'); feedbackRef.current = 'correct'
      }

      clearTimeout(feedbackTimeout.current)
      feedbackTimeout.current = setTimeout(() => {
        setFeedback('idle')
        feedbackRef.current = 'idle'
        playOpponentMove(gameCopy, currentSolutionIndex)
      }, isLastPlayerMove ? 700 : 0)

      return true
    } else {
      const newErrors = errorsRef.current + 1
      setErrors(newErrors)
      errorsRef.current = newErrors
      setHighlightSquares({
        [sourceSquare]: { background: 'rgba(231,76,60,0.3)' },
        [targetSquare]: { background: 'rgba(231,76,60,0.4)' },
      })
      errorSound.currentTime = 0; errorSound.play()
      setFeedback('wrong')
      feedbackRef.current = 'wrong'
      onError?.()
      clearTimeout(feedbackTimeout.current)

      if (autoSkipAfterErrors > 0 && newErrors >= autoSkipAfterErrors) {
        setFeedback('skipping')
        feedbackRef.current = 'skipping'
        feedbackTimeout.current = setTimeout(() => {
          setHighlightSquares({})
          const elapsed = Date.now() - startTimeRef.current
          onSkip?.(newErrors)
        }, 900)
      } else {
        feedbackTimeout.current = setTimeout(() => {
          setHighlightSquares({})
          setFeedback('idle')
          feedbackRef.current = 'idle'
        }, 600)
      }
      return false
    }
  }

  useEffect(() => { processMoveRef.current = processMove }, )


  // Arma el posible drag (sigue al cursor con el mouseDown) para una pieza propia
  function armDrag(sq: string, e: React.MouseEvent) {
    mouseDownSquareRef.current = sq
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current = true
    setIsDragging(true)
    setDraggedSquare(sq)
    setDragPos({ x: e.clientX, y: e.clientY })
    const p = gameRef.current.get(sq as any)!
    const pc = (p.color === 'w' ? 'w' : 'b') + p.type.toUpperCase()
    setDragPiece(pc)
    dragPieceRef.current = pc
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (disabled || feedbackRef.current === 'opponent' || feedbackRef.current === 'skipping') return
    if (!boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const sq = pixelToSquare(x, y, boardSize, boardOrientation)
    if (!sq) return

    const hasSelection = !!selectedSquareRef.current

    // Hay selección previa y se toca una casilla distinta a la seleccionada
    if (hasSelection && selectedSquareRef.current !== sq) {
      if (isOwnPiece(sq)) {
        // Tocar otra pieza propia: cambia la selección y arma drag para ella,
        // igual que el primer click — click-to-move y drag activos a la vez.
        setSelectedSquare(sq)
        selectedSquareRef.current = sq
        highlightMoves(sq)
        armDrag(sq, e)
      } else {
        // Tocar una casilla destino (vacía o pieza rival): intento de movimiento
        // ya en el mouseDown, como en lichess/chess.com.
        const fromSq = selectedSquareRef.current
        const pieceOnSelected = fromSq ? gameRef.current.get(fromSq as any) : null
        if (fromSq && pieceOnSelected) {
          const pieceStr = (pieceOnSelected.color === 'w' ? 'w' : 'b') + pieceOnSelected.type.toUpperCase()
          processMove(fromSq, sq, pieceStr)
        }
        mouseDownSquareRef.current = null
        mouseDownPosRef.current = null
      }
      return
    }

    // Sin selección previa, o se vuelve a tocar la misma casilla ya seleccionada.
    if (isOwnPiece(sq)) {
      armDrag(sq, e)
      if (!hasSelection) {
        // Primer click sobre una pieza propia: selecciona (click-to-move) Y
        // arma el drag en el mismo mouseDown — ambos arrancan simultáneos.
        setSelectedSquare(sq)
        selectedSquareRef.current = sq
        highlightMoves(sq)
      }
      // Si ya estaba seleccionada esta misma casilla, no se deselecciona aquí:
      // el click-to-move permanece activo hasta tocar destino u otra pieza.
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!mouseDownSquareRef.current || !mouseDownPosRef.current) return
    if (disabled || feedbackRef.current === 'opponent' || feedbackRef.current === 'skipping') return
    if (isDraggingRef.current) setDragPos({ x: e.clientX, y: e.clientY })
  }

  const dragPieceImage = dragPiece ? `/pieces/${dragPiece}.svg` : null

  const isPlayerTurn = feedback !== 'opponent' && feedback !== 'skipping' && solutionIndex < puzzle.solution.length
  const turnLabel =
    feedback === 'skipping' ? 'Pasando al siguiente...' :
    feedback === 'opponent' ? 'Rival respondiendo...' :
    `Tu turno · ${playerColor === 'white' ? '♔ Blancas' : '♚ Negras'}`
  const turnDot = feedback === 'skipping' || feedback === 'opponent' ? 'bg-bone-3' : 'bg-amber animate-pulse'
  const turnText = feedback === 'skipping' ? 'text-red-400' : feedback === 'opponent' ? 'text-bone-3' : 'text-amber'
  const isLastMove = solutionIndex >= puzzle.solution.length - 1
  const borderColor =
    feedback === 'correct' && isLastMove ? 'rgba(46,204,113,0.6)' :
    feedback === 'wrong' || feedback === 'skipping' ? 'rgba(231,76,60,0.6)' :
    feedback === 'opponent' ? 'rgba(212,160,23,0.3)' :
    'rgba(212,160,23,0.12)'

  const allHighlights = { ...highlightSquares }
  if (draggedSquare) allHighlights[draggedSquare] = { background: 'rgba(212,160,23,0.3)' }
  externalHighlights.forEach(sq => {
    allHighlights[sq] = { background: 'radial-gradient(circle, rgba(212,160,23,0.9) 0%, rgba(212,160,23,0.4) 60%, transparent 100%)' }
  })

  useEffect(() => {
    if (!draggedSquare) return
    const style = document.createElement('style')
    style.id = 'drag-hide'
    style.textContent = `[data-square="${draggedSquare}"] > div > div { opacity: 0.15 !important; }`
    document.head.appendChild(style)
    return () => document.getElementById('drag-hide')?.remove()
  }, [draggedSquare])

  return (
    <div>
      <div className={`font-mono text-xs uppercase tracking-widest mb-3 flex items-center gap-2 ${turnText}`}>
        <span className={`w-2 h-2 rounded-full inline-block ${turnDot}`} />
        {turnLabel}
        {!isPlayerTurn && feedback !== 'skipping' && (
          <span className="text-bone-3 normal-case tracking-normal ml-1">
            (rival: {playerColor === 'white' ? '♚ Negras' : '♔ Blancas'})
          </span>
        )}
      </div>

      {isPlayerTurn && !selectedSquare && !draggedSquare && (
        <p className="font-mono text-xs text-bone-3 mb-2 text-center">Haz clic en una pieza para seleccionarla</p>
      )}
      {isPlayerTurn && (selectedSquare || draggedSquare) && (
        <p className="font-mono text-xs text-amber mb-2 text-center">Pieza seleccionada — haz clic en la casilla destino</p>
      )}

      <div
        ref={boardRef}
        className="relative"
        style={{ width: boardSize, userSelect: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        <div
          className="board-shadow rounded-sm overflow-hidden transition-all duration-300"
          style={{ width: boardSize, boxShadow: `0 0 0 2px ${borderColor}, 0 0 60px ${borderColor}` }}
        >
          <Chessboard
            position={displayFen}
            onPieceDrop={() => false}
            onSquareClick={() => {}}
            boardOrientation={boardOrientation}
            customSquareStyles={allHighlights}
            boardWidth={boardSize}
            arePiecesDraggable={false}
            customBoardStyle={{ borderRadius: '2px', cursor: 'default' }}
            customDarkSquareStyle={{ backgroundColor: '#b58863' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
            animationDuration={OPPONENT_ANIM_MS}
          />
        </div>

        {/* Pre-render all piece images hidden so browser decodes them before first drag */}
        {PIECE_CODES.map(code => (
          <img key={code} src={`/pieces/${code}.svg`} style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, pointerEvents: 'none' }} alt="" />
        ))}
        <img
          src={dragPieceImage ?? undefined}
          style={{
            position: 'fixed',
            left: dragPos ? dragPos.x - boardSize / 16 : -9999,
            top: dragPos ? dragPos.y - boardSize / 16 : -9999,
            width: boardSize / 8,
            height: boardSize / 8,
            pointerEvents: 'none',
            zIndex: 9999,
            visibility: isDragging && dragPos && dragPieceImage ? 'visible' : 'hidden',
          }}
          alt=""
        />

        {feedback === 'correct' && (
          <div className="absolute inset-0 pointer-events-none rounded-sm" style={{ backgroundColor: 'rgba(46,204,113,0.22)' }} />
        )}
        {feedback === 'wrong' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="font-mono text-red-400 text-4xl font-bold opacity-90 animate-bounce">✗</span>
          </div>
        )}
        {feedback === 'skipping' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-red-900/20 rounded-sm">
            <span className="font-mono text-red-400 text-lg font-bold opacity-90">Siguiente →</span>
          </div>
        )}
        {promotionMove && (
          <div className="absolute inset-0 flex items-center justify-center bg-void/80 z-50 rounded-sm">
            <div className="bg-void-2 border border-void-4 p-4 rounded-sm">
              <p className="font-mono text-xs text-bone-3 mb-3 text-center uppercase tracking-widest">Promocionar a</p>
              <div className="flex gap-2">
                {(['q','r','b','n'] as const).map(p => {
                  const labels: Record<string, string> = { q: '♛ Dama', r: '♜ Torre', b: '♝ Alfil', n: '♞ Caballo' }
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        const { from, to, piece: pc } = promotionMove
                        setPromotionMove(null)
                        processMove(from, to, pc, p)
                      }}
                      className="px-4 py-3 font-mono text-sm border border-void-4 hover:border-amber hover:text-amber transition-colors text-bone"
                    >
                      {labels[p]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
