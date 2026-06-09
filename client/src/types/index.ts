export interface Puzzle {
  id: number
  blockId: number
  blockName?: string
  orderInBlock: number
  fen: string
  solution: string[]
}

export interface Block {
  id: number
  name: string
  description?: string
  puzzleCount: number
}

export interface Player {
  id: string
  nickname: string
  solved: number
  errors: number
  totalPuzzles: number
  finished: boolean
  finishedAt?: number
  startedAt?: number
}

export interface Room {
  code: string
  hostId: string
  puzzleIds: number[]      // ← ahora son IDs de puzzles específicos (no blockId)
  totalPuzzles: number
  players: Player[]
  status: 'waiting' | 'racing' | 'finished'
  startedAt?: number
  timeLimit?: number
}

export interface AttemptRecord {
  id: number
  nickname: string
  blockId?: number
  blockName?: string
  attemptNumber: number
  totalTimeMs: number
  solved: number
  totalPuzzles: number
  errors: number
  accuracy: number
  createdAt: string
  puzzleTimes?: PuzzleTimeRecord[]
}

export interface PuzzleTimeRecord {
  puzzleId: number
  orderInBlock: number
  timeMs: number
  errors: number
}

export interface CreateRoomPayload {
  nickname: string
  puzzleIds: number[]
  timeLimit?: number
}

export interface PuzzleSolvedPayload {
  solved: number
  errors: number
  puzzleTimeMs: number
}

export interface RaceResult {
  position: number
  nickname: string
  solved: number
  totalPuzzles: number
  totalTimeMs: number
  errors: number
  accuracy: number
}
