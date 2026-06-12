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

export interface AttemptRecord {
  id: number
  userId?: number
  nickname: string
  blockId: number
  blockName?: string
  attemptNumber: number
  totalTimeMs: number
  solved: number
  totalPuzzles: number
  errors: number
  accuracy: number
  ppm: number
  createdAt: string
}

export interface PuzzleTimeRecord {
  puzzleId: number
  orderInBlock: number
  timeMs: number
  errors: number
}
