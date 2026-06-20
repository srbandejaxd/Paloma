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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
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
  const startTimeRef = useRef<number>(Date.now())
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>()
  const justMovedRef = useRef(false)
  const blockClickRef = useRef(false)

  // ✅ Ref para leer errors siempre actualizado dentro de callbacks/timeouts
  const errorsRef = useRef(0)
  useEffect(() => { errorsRef.current = errors }, [errors])

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)

  const isMobile = useIsMobile()
  const boardSize = useBoardSize()

  const playerColor = (() => {
    const parts = puzzle.fen.split(' ')
    return parts[1] === 'w' ? 'white' : 'black'
  })()

  useEffect(() => {
    const newGame = new Chess()
    try {
      newGame.load(puzzle.fen)
    } catch {
      console.error('Invalid FEN:', puzzle.fen)
    }
    setGame(newGame)
    setSolutionIndex(0)
    setErrors(0)
    errorsRef.current = 0  // ✅ reset también la ref al cambiar puzzle
    setFeedback('idle')
    setHighlightSquares({})
    setSelectedSquare(null)
    startTimeRef.current = Date.now()
  }, [puzzle])

  const playOpponentMove = useCallback(
    (currentGame: Chess, currentIndex: number) => {
      const nextIndex = currentIndex + 1
      if (nextIndex >= puzzle.solution.length) {
        const elapsed = Date.now() - startTimeRef.current
        setTimeout(() => {
          onSolved(elapsed, errorsRef.current)
        }, 300)
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

  function highlightMoves(square: string) {
    const moves = game.moves({ square: square as any, verbose: true })
    const highlights: Record<string, { background: string }> = {
      [square]: { background: 'rgba(212,160,23,0.5)' },
    }
    moves.forEach((m: any) => {
      highlights[m.to] = { background: 'rgba(212,160,23,0.2)' }
    })
    setHighlightSquares(highlights)
  }

  function isOwnPiece(square: string): boolean {
    const p = game.get(square as any)
    return !!p && (playerColor === 'white' ? p.color === 'w' : p.color === 'b')
  }

  function processMove(sourceSquare: string, targetSquare: string, piece: string): boolean {
    if (disabled || feedback === 'opponent' || feedback === 'skipping') return false

    const expectedSAN = puzzle.solution[solutionIndex]
    const gameCopy = new Chess()
    gameCopy.loadPgn(game.pgn())

    let moveResult
    try {
      const isPromotion =
        piece.toLowerCase().includes('p') &&
        (targetSquare[1] === '8' || targetSquare[1] === '1')

      moveResult = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? 'q' : undefined,
      })
    } catch {
      return false
    }

    if (!moveResult) return false

    const expectedMove = moveFromSAN(new Chess(game.fen()), expectedSAN)
    const isCorrect =
      expectedMove &&
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

      const isLastPlayerMove = solutionIndex + 1 >= puzzle.solution.length - 1 || solutionIndex + 1 >= puzzle.solution.length
      if (isLastPlayerMove) {
        setFeedback('correct')
      }

      clearTimeout(feedbackTimeout.current)
      feedbackTimeout.current = setTimeout(() => {
        setFeedback('idle')
        playOpponentMove(gameCopy, solutionIndex)
      }, isLastPlayerMove ? 400 : 0)
    } else {
      const newErrors = errors + 1
      setErrors(newErrors)
      errorsRef.current = newErrors  // ✅ actualizar ref inmediatamente, sin esperar el useEffect
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

    justMovedRef.current = true
    blockClickRef.current = true
    setTimeout(() => { justMovedRef.current = false }, 50)
    setTimeout(() => { blockClickRef.current = false }, 80)
    return true
  }

  function onDrop(sourceSquare: string, targetSquare: string, piece: string): boolean {
    setSelectedSquare(null)
    return processMove(sourceSquare, targetSquare, piece)
  }

  function onSquareClick(square: string) {
    if (disabled || feedback === 'opponent' || feedback === 'skipping') return
    if (blockClickRef.current) return

    if (selectedSquare === null) {
      if (isOwnPiece(square)) {
        setSelectedSquare(square)
        highlightMoves(square)
      }
      return
    }

    if (square === selectedSquare) {
      setSelectedSquare(null)
      setHighlightSquares({})
      return
    }

    if (isOwnPiece(square)) {
      setSelectedSquare(square)
      highlightMoves(square)
      return
    }
    // Si hay pieza enemiga en el destino, intentar captura directamente
const targetPiece = game.get(square as any)
if (targetPiece) {
  const pieceOnSel = game.get(selectedSquare as any)
  if (!pieceOnSel) {
    setSelectedSquare(null)
    setHighlightSquares({})
    return
  }
  const pieceStr = (pieceOnSel.color === 'w' ? 'w' : 'b') + pieceOnSel.type.toUpperCase()
  processMove(selectedSquare, square, pieceStr)
  return
}

    const pieceOnSelected = game.get(selectedSquare as any)
    if (!pieceOnSelected) {
      setSelectedSquare(null)
      setHighlightSquares({})
      return
    }

    const pieceStr =
      (pieceOnSelected.color === 'w' ? 'w' : 'b') + pieceOnSelected.type.toUpperCase()

    const moved = processMove(selectedSquare, square, pieceStr)
    if (!moved && feedback === 'idle') {
      setSelectedSquare(null)
      setHighlightSquares({})
    }
  }

  const boardOrientation = playerColor === 'white' ? 'white' : 'black'

  const isPlayerTurn = feedback !== 'opponent' && feedback !== 'skipping' && solutionIndex < puzzle.solution.length
  const turnLabel =
    feedback === 'skipping'
      ? 'Pasando al siguiente...'
      : feedback === 'opponent'
      ? 'Rival respondiendo...'
      : `Tu turno · ${playerColor === 'white' ? '♔ Blancas' : '♚ Negras'}`
  const turnDot =
    feedback === 'skipping' || feedback === 'opponent' ? 'bg-bone-3' : 'bg-amber animate-pulse'
  const turnText =
    feedback === 'skipping'
      ? 'text-red-400'
      : feedback === 'opponent'
      ? 'text-bone-3'
      : 'text-amber'

   const isLastMove = solutionIndex >= puzzle.solution.length - 1
   const borderColor =
    feedback === 'correct' && isLastMove
      ? 'rgba(46,204,113,0.6)'
      : feedback === 'wrong' || feedback === 'skipping'
      ? 'rgba(231,76,60,0.6)'
      : feedback === 'opponent'
      ? 'rgba(212,160,23,0.3)'
      : 'rgba(212,160,23,0.12)'

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

      {isPlayerTurn && !selectedSquare && (
        <p className="font-mono text-xs text-bone-3 mb-2 text-center">
          Haz clic en una pieza para seleccionarla
        </p>
      )}
      {isPlayerTurn && selectedSquare && (
        <p className="font-mono text-xs text-amber mb-2 text-center">
          Pieza seleccionada — haz clic en la casilla destino
        </p>
      )}

      <div
  className="relative"
  style={{ width: boardSize }}
  onMouseDown={(e) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const squareSize = boardSize / 8
    const col = Math.floor((e.clientX - rect.left) / squareSize)
    const row = Math.floor((e.clientY - rect.top) / squareSize)
    const file = 'abcdefgh'[playerColor === 'white' ? col : 7 - col]
    const rank = playerColor === 'white' ? 8 - row : row + 1
    const sq = `${file}${rank}`
    if (selectedSquare && !isOwnPiece(sq)) {
      onSquareClick(sq)
    }
  }}
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
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick}
            onPieceDragBegin={() => {
              setSelectedSquare(null)
              setHighlightSquares({})
            }}
            onPieceDragEnd={() => {
              setSelectedSquare(null)
              setHighlightSquares({})
            }}
            boardOrientation={boardOrientation}
            customSquareStyles={highlightSquares}
            boardWidth={boardSize}
            isDraggablePiece={({ piece }) => {
              if (disabled || feedback === 'opponent' || feedback === 'skipping') return false
              if (justMovedRef.current) return false
              const isOwn = playerColor === 'white' ? piece.startsWith('w') : piece.startsWith('b')
              return isOwn
            }}
            customBoardStyle={{
              borderRadius: '2px',
            }}
            customDarkSquareStyle={{ backgroundColor: '#2C2C3E' }}
            customLightSquareStyle={{ backgroundColor: '#4A4A60' }}
            animationDuration={200}
            customDndBackendOptions={{ delay: 150 }}
          />
        </div>

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
