import { useState, useEffect, useCallback, useRef } from 'react'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { Puzzle } from '../../types'

interface PuzzleBoardProps {
  puzzle: Puzzle
  onSolved: (timeMs: number, errors: number) => void
  onError?: () => void
  onSkip?: (errors: number) => void   // [NUEVO] skip automático por demasiados errores
  disabled?: boolean
  autoSkipAfterErrors?: number         // [NUEVO] cuántos errores antes de auto-skip (default: 1)
}

type FeedbackState = 'idle' | 'correct' | 'wrong' | 'opponent' | 'skipping'

// Parse UCI or SAN move - react-chessboard uses UCI (e2e4 style)
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

  // [CAMBIO 1] Determina el color del jugador para mostrar de quién es el turno
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
    setFeedback('idle')
    setHighlightSquares({})
    startTimeRef.current = Date.now()
  }, [puzzle])

  const playOpponentMove = useCallback(
    (currentGame: Chess, currentIndex: number) => {
      const nextIndex = currentIndex + 1
      if (nextIndex >= puzzle.solution.length) {
        // Puzzle complete
        const elapsed = Date.now() - startTimeRef.current
        setTimeout(() => {
          onSolved(elapsed, errors)
        }, 300)
        return
      }

      const opponentSAN = puzzle.solution[nextIndex]
      setFeedback('opponent')

      setTimeout(() => {
        const gameCopy = new Chess()
        gameCopy.loadPgn(currentGame.pgn())
        const moveResult = gameCopy.move(opponentSAN)
        if (moveResult) {
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
            setTimeout(() => onSolved(elapsed, errors), 400)
          }
        }
      }, 500)
    },
    [puzzle.solution, errors, onSolved]
  )

  function onDrop(sourceSquare: string, targetSquare: string, piece: string): boolean {
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

    if (isCorrect) {
      setHighlightSquares({
        [moveResult.from]: { background: 'rgba(46,204,113,0.25)' },
        [moveResult.to]: { background: 'rgba(46,204,113,0.4)' },
      })
      setFeedback('correct')
      setGame(gameCopy)

      clearTimeout(feedbackTimeout.current)
      feedbackTimeout.current = setTimeout(() => {
        setFeedback('idle')
        playOpponentMove(gameCopy, solutionIndex)
      }, 400)
    } else {
      // Movimiento incorrecto
      const newErrors = errors + 1
      setErrors(newErrors)
      setHighlightSquares({
        [sourceSquare]: { background: 'rgba(231,76,60,0.3)' },
        [targetSquare]: { background: 'rgba(231,76,60,0.4)' },
      })
      setFeedback('wrong')
      onError?.()

      clearTimeout(feedbackTimeout.current)

      // [CAMBIO 3] Auto-skip si se superó el límite de errores
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

    return true
  }

  const boardOrientation = playerColor === 'white' ? 'white' : 'black'

  // [CAMBIO 1] Calcular turno actual
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

  const borderColor =
    feedback === 'correct'
      ? 'rgba(46,204,113,0.6)'
      : feedback === 'wrong' || feedback === 'skipping'
      ? 'rgba(231,76,60,0.6)'
      : feedback === 'opponent'
      ? 'rgba(212,160,23,0.3)'
      : 'rgba(212,160,23,0.12)'

  return (
    <div>
      {/* [CAMBIO 1] Indicador de turno */}
      <div className={`font-mono text-xs uppercase tracking-widest mb-3 flex items-center gap-2 ${turnText}`}>
        <span className={`w-2 h-2 rounded-full inline-block ${turnDot}`} />
        {turnLabel}
        {!isPlayerTurn && feedback !== 'skipping' && (
          <span className="text-bone-3 normal-case tracking-normal ml-1">
            (rival: {playerColor === 'white' ? '♚ Negras' : '♔ Blancas'})
          </span>
        )}
      </div>

      <div className="relative">
        <div
          className="board-shadow rounded-sm overflow-hidden transition-all duration-300"
          style={{
            boxShadow: `0 0 0 2px ${borderColor}, 0 0 60px ${borderColor}`,
          }}
        >
          <Chessboard
            position={game.fen()}
            onPieceDrop={onDrop}
            boardOrientation={boardOrientation}
            customSquareStyles={highlightSquares}
            isDraggablePiece={({ piece }) => {
              if (disabled || feedback === 'opponent' || feedback === 'skipping') return false
              return playerColor === 'white'
                ? piece.startsWith('w')
                : piece.startsWith('b')
            }}
            customBoardStyle={{
              borderRadius: '2px',
            }}
            customDarkSquareStyle={{ backgroundColor: '#2C2C3E' }}
            customLightSquareStyle={{ backgroundColor: '#4A4A60' }}
            animationDuration={200}
          />
        </div>

        {/* Feedback overlay */}
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
