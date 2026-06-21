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
  autoSkipAfterErrors?: number
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

function moveFromSAN(game: Chess, san: string): { from: string; to: string; promotion?: string } | null {
  try {
    const result = game.move(san)
    if (!result) return null
    game.undo()
    return { from: result.from, to: result.to, promotion: result.promotion }
  } catch {
    return null
  }
}

function useBoardSize() {
  const [size, setSize] = useState(480)
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (vw < 640) {
        setSize(Math.min(vw - 32, 480))
      } else {
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

// Convierte pixel x,y dentro del board a casilla ajedrez
function pixelToSquare(x: number, y: number, boardSize: number, orientation: 'white' | 'black'): string {
  const col = Math.floor(x / (boardSize / 8))
  const row = Math.floor(y / (boardSize / 8))
  const clampedCol = Math.max(0, Math.min(7, col))
  const clampedRow = Math.max(0, Math.min(7, row))
  const file = orientation === 'white' ? clampedCol : 7 - clampedCol
  const rank = orientation === 'white' ? 7 - clampedRow : clampedRow
  return 'abcdefgh'[file] + (rank + 1)
}

export default function PuzzleBoard({
  puzzle,
  onSolved,
  onError,
  onSkip,
  disabled,
  autoSkipAfterErrors = 1,
}: PuzzleBoardProps) {
  const [game, setGame] = useState(new Chess())
  const [feedback, setFeedback] = useState<FeedbackState>('idle')
  const [solutionIndex, setSolutionIndex] = useState(0)
  const [errors, setErrors] = useState(0)
  const [highlightSquares, setHighlightSquares] = useState<Record<string, { background: string }>>({})
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [draggedSquare, setDraggedSquare] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [dragPiece, setDragPiece] = useState<string | null>(null)

  const startTimeRef = useRef<number>(Date.now())
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>()
  const errorsRef = useRef(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const mouseDownSquareRef = useRef<string | null>(null)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const DRAG_THRESHOLD = 6 // pixels antes de considerar drag

  useEffect(() => { errorsRef.current = errors }, [errors])
  
  const boardSize = useBoardSize()

  const playerColor = (() => {
    const parts = puzzle.fen.split(' ')
    return parts[1] === 'w' ? 'white' : 'black'
  })()

  const boardOrientation = playerColor
  useEffect(() => {
  function onWindowMouseMove(e: MouseEvent) {
    if (!isDraggingRef.current) return
    setDragPos({ x: e.clientX, y: e.clientY })
  }
  function onWindowMouseUp(e: MouseEvent) {
    if (!isDraggingRef.current) return
    const downSq = mouseDownSquareRef.current
    isDraggingRef.current = false
    setDraggedSquare(null)
    setDragPos(null)
    mouseDownSquareRef.current = null
    mouseDownPosRef.current = null
    if (!boardRef.current || !downSq || !dragPiece) return
    const rect = boardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < 0 || y < 0 || x > boardSize || y > boardSize) return
    const upSq = pixelToSquare(x, y, boardSize, boardOrientation)
    if (upSq !== downSq) processMove(downSq, upSq, dragPiece)
  }
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
  return () => {
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', onWindowMouseUp)
  }
}, [dragPiece, boardSize, boardOrientation])


  useEffect(() => {
    const newGame = new Chess()
    try { newGame.load(puzzle.fen) } catch { console.error('Invalid FEN:', puzzle.fen) }
    setGame(newGame)
    setSolutionIndex(0)
    setErrors(0)
    errorsRef.current = 0
    setFeedback('idle')
    setHighlightSquares({})
    setSelectedSquare(null)
    setDraggedSquare(null)
    setDragPos(null)
    setDragPiece(null)
    isDraggingRef.current = false
    startTimeRef.current = Date.now()
  }, [puzzle])

  const playOpponentMove = useCallback(
    (currentGame: Chess, currentIndex: number) => {
      const nextIndex = currentIndex + 1
      if (nextIndex >= puzzle.solution.length) {
        const elapsed = Date.now() - startTimeRef.current
        setTimeout(() => onSolved(elapsed, errorsRef.current), 300)
        return
      }
      const opponentSAN = puzzle.solution[nextIndex]
      const gameCopy = new Chess()
      gameCopy.loadPgn(currentGame.pgn())
      const moveResult = gameCopy.move(opponentSAN)
      if (moveResult) {
        if (moveResult.captured) { captureSound.currentTime = 0; captureSound.play() }
        else { moveSound.currentTime = 0; moveSound.play() }
        setHighlightSquares({
          [moveResult.from]: { background: 'rgba(212,160,23,0.25)' },
          [moveResult.to]: { background: 'rgba(212,160,23,0.4)' },
        })
        setGame(gameCopy)
        const nextPlayerIndex = nextIndex + 1
        setSolutionIndex(nextPlayerIndex)
        setFeedback('idle')
        if (nextPlayerIndex >= puzzle.solution.length) {
          const elapsed = Date.now() - startTimeRef.current
          correctSound.currentTime = 0; correctSound.play()
          setTimeout(() => onSolved(elapsed, errorsRef.current), 400)
        }
      }
    },
    [puzzle.solution, onSolved]
  )

  function isOwnPiece(square: string): boolean {
    const p = game.get(square as any)
    return !!p && (playerColor === 'white' ? p.color === 'w' : p.color === 'b')
  }

  function highlightMoves(square: string) {
    const moves = game.moves({ square: square as any, verbose: true })
    const highlights: Record<string, { background: string }> = {
      [square]: { background: 'rgba(212,160,23,0.5)' },
    }
    moves.forEach((m: any) => {
      const hasEnemy = !!game.get(m.to as any)
      highlights[m.to] = hasEnemy
        ? { background: 'radial-gradient(circle, rgba(0,0,0,0.15) 85%, transparent 85%)' }
        : { background: 'radial-gradient(circle, rgba(0,0,0,0.2) 30%, transparent 30%)' }
    })
    setHighlightSquares(highlights)
  }

  function processMove(sourceSquare: string, targetSquare: string, piece: string): boolean {
    if (disabled || feedback === 'opponent' || feedback === 'skipping') return false

    const expectedSAN = puzzle.solution[solutionIndex]
    const gameCopy = new Chess()
    gameCopy.loadPgn(game.pgn())

    let moveResult
    try {
      const isPromotion = piece.toLowerCase().includes('p') &&
        (targetSquare[1] === '8' || targetSquare[1] === '1')
      moveResult = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? 'q' : undefined,
      })
    } catch { return false }

    if (!moveResult) return false

    const expectedMove = moveFromSAN(new Chess(game.fen()), expectedSAN)
    const isCorrect = expectedMove &&
      expectedMove.from === moveResult.from &&
      expectedMove.to === moveResult.to

    setSelectedSquare(null)

    if (isCorrect) {
      if (moveResult.captured) { captureSound.currentTime = 0; captureSound.play() }
      else { moveSound.currentTime = 0; moveSound.play() }
      setHighlightSquares({
        [moveResult.from]: { background: 'rgba(46,204,113,0.25)' },
        [moveResult.to]: { background: 'rgba(46,204,113,0.4)' },
      })
      setGame(gameCopy)

      const isLastPlayerMove = solutionIndex + 1 >= puzzle.solution.length
      if (isLastPlayerMove) setFeedback('correct')

      clearTimeout(feedbackTimeout.current)
      feedbackTimeout.current = setTimeout(() => {
        setFeedback('idle')
        playOpponentMove(gameCopy, solutionIndex)
      }, isLastPlayerMove ? 400 : 0)

      return true
    } else {
      const newErrors = errors + 1
      setErrors(newErrors)
      errorsRef.current = newErrors
      setHighlightSquares({
        [sourceSquare]: { background: 'rgba(231,76,60,0.3)' },
        [targetSquare]: { background: 'rgba(231,76,60,0.4)' },
      })
      errorSound.currentTime = 0; errorSound.play()
      setFeedback('wrong')
      onError?.()
      clearTimeout(feedbackTimeout.current)

      if (autoSkipAfterErrors > 0 && newErrors >= autoSkipAfterErrors) {
        setFeedback('skipping')
        feedbackTimeout.current = setTimeout(() => {
          setHighlightSquares({})
          const elapsed = Date.now() - startTimeRef.current
          onSkip?.(newErrors)
        }, 900)
      } else {
        feedbackTimeout.current = setTimeout(() => {
          setHighlightSquares({})
          setFeedback('idle')
        }, 600)
      }
      return false
    }
  }

  // ── Custom mouse handlers ──────────────────────────────────────────────────

  function getBoardSquare(e: React.MouseEvent): string | null {
    if (!boardRef.current) return null
    const rect = boardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x < 0 || y < 0 || x > boardSize || y > boardSize) return null
    return pixelToSquare(x, y, boardSize, boardOrientation)
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (disabled || feedback === 'opponent' || feedback === 'skipping') return
    const sq = getBoardSquare(e)
    if (!sq) return
    mouseDownSquareRef.current = sq
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    isDraggingRef.current = false

    // Si hay pieza propia — guardar para posible drag
    if (isOwnPiece(sq)) {
      const p = game.get(sq as any)!
      setDragPiece((p.color === 'w' ? 'w' : 'b') + p.type.toUpperCase())
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!mouseDownSquareRef.current || !mouseDownPosRef.current) return
    if (disabled || feedback === 'opponent' || feedback === 'skipping') return

    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (!isDraggingRef.current && dist > DRAG_THRESHOLD) {
      // Solo iniciar drag si es pieza propia
      if (isOwnPiece(mouseDownSquareRef.current)) {
        isDraggingRef.current = true
        setDraggedSquare(mouseDownSquareRef.current)
        setSelectedSquare(null)
        setHighlightSquares({})
      }
    }

    if (isDraggingRef.current) {
      setDragPos({ x: e.clientX, y: e.clientY })
    }
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (e.button !== 0) return
    const downSq = mouseDownSquareRef.current
    mouseDownSquareRef.current = null
    mouseDownPosRef.current = null

    if (!downSq) return
    if (disabled || feedback === 'opponent' || feedback === 'skipping') {
      isDraggingRef.current = false
      setDraggedSquare(null)
      setDragPos(null)
      return
    }

    const upSq = getBoardSquare(e)

    if (isDraggingRef.current) {
      // Fin de drag
      isDraggingRef.current = false
      setDraggedSquare(null)
      setDragPos(null)
      if (upSq && upSq !== downSq && dragPiece) {
        processMove(downSq, upSq, dragPiece)
      }
      return
    }

    // Es un click (sin drag)
    if (!upSq) return

    if (selectedSquare === null) {
      if (isOwnPiece(upSq)) {
        setSelectedSquare(upSq)
        highlightMoves(upSq)
      }
      return
    }

    if (upSq === selectedSquare) {
      setSelectedSquare(null)
      setHighlightSquares({})
      return
    }

    if (isOwnPiece(upSq)) {
      setSelectedSquare(upSq)
      highlightMoves(upSq)
      return
    }

    // Mover a casilla destino (captura o casilla vacía)
    const pieceOnSelected = game.get(selectedSquare as any)
    if (!pieceOnSelected) {
      setSelectedSquare(null)
      setHighlightSquares({})
      return
    }
    const pieceStr = (pieceOnSelected.color === 'w' ? 'w' : 'b') + pieceOnSelected.type.toUpperCase()
    const moved = processMove(selectedSquare, upSq, pieceStr)
    if (!moved && feedback === 'idle') {
      setSelectedSquare(null)
      setHighlightSquares({})
    }
  }

  function handleMouseLeave() {
  // No cancelar drag al salir — se maneja en window
  }

  // Pieza siendo arrastrada visualmente
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

  // Highlight de la casilla siendo arrastrada (ocultar pieza original)
  const allHighlights = { ...highlightSquares }
  if (draggedSquare) {
    allHighlights[draggedSquare] = { background: 'rgba(212,160,23,0.3)' }
  }
  useEffect(() => {
  if (!draggedSquare) return
  const style = document.createElement('style')
  style.id = 'drag-hide'
  style.textContent = `[data-square="${draggedSquare}"] piece { opacity: 0 !important; }`
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
        <p className="font-mono text-xs text-bone-3 mb-2 text-center">
          Haz clic en una pieza para seleccionarla
        </p>
      )}
      {isPlayerTurn && (selectedSquare || draggedSquare) && (
        <p className="font-mono text-xs text-amber mb-2 text-center">
          Pieza seleccionada — haz clic en la casilla destino
        </p>
      )}

      <div
        ref={boardRef}
        className="relative"
        style={{ width: boardSize, userSelect: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="board-shadow rounded-sm overflow-hidden transition-all duration-300"
          style={{
            width: boardSize,
            boxShadow: `0 0 0 2px ${borderColor}, 0 0 60px ${borderColor}`,
          }}
        >
          <Chessboard
            position={game.fen()}
            onPieceDrop={() => false}
            onSquareClick={() => {}}
            boardOrientation={boardOrientation}
            customSquareStyles={allHighlights}
            boardWidth={boardSize}
            arePiecesDraggable={false}
            customBoardStyle={{ borderRadius: '2px', cursor: 'default' }}
            customDarkSquareStyle={{ backgroundColor: '#b58863' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
            animationDuration={150}
          />
        </div>

        {/* Pieza flotante durante drag */}
        {isDraggingRef.current && dragPos && dragPieceImage && (
          <img
            src={dragPieceImage}
            style={{
              position: 'fixed',
              left: dragPos.x - boardSize / 16,
              top: dragPos.y - boardSize / 16,
              width: boardSize / 8,
              height: boardSize / 8,
              pointerEvents: 'none',
              zIndex: 9999,
            }}
            alt=""
          />
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
      </div>
    </div>
  )
}
