import { AttemptRecord, Block, Puzzle } from '../types'

const BASE = '/api'

export async function fetchBlocks(): Promise<Block[]> {
  const res = await fetch(`${BASE}/blocks`)
  if (!res.ok) throw new Error('Failed to fetch blocks')
  return res.json()
}

// [NUEVO] Todos los puzzles de todos los bloques con blockName incluido
export async function fetchAllPuzzles(): Promise<Puzzle[]> {
  const res = await fetch(`${BASE}/puzzles`)
  if (!res.ok) throw new Error('Failed to fetch puzzles')
  return res.json()
}

// [NUEVO] Puzzles por lista de IDs (para la carrera con selección custom)
export async function fetchPuzzlesByIds(ids: number[]): Promise<Puzzle[]> {
  const res = await fetch(`${BASE}/puzzles/by-ids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error('Failed to fetch puzzles by ids')
  return res.json()
}

export async function fetchPuzzlesForBlock(blockId: number): Promise<Puzzle[]> {
  const res = await fetch(`${BASE}/blocks/${blockId}/puzzles`)
  if (!res.ok) throw new Error('Failed to fetch puzzles')
  return res.json()
}

export async function fetchAttempts(nickname: string, blockId?: number): Promise<AttemptRecord[]> {
  const params = new URLSearchParams({ nickname })
  if (blockId !== undefined) params.set('blockId', String(blockId))
  const res = await fetch(`${BASE}/attempts?${params}`)
  if (!res.ok) throw new Error('Failed to fetch attempts')
  return res.json()
}

export async function saveAttempt(data: {
  nickname: string
  blockId?: number
  totalTimeMs: number
  solved: number
  totalPuzzles: number
  errors: number
  puzzleTimes: { puzzleId: number; orderInBlock: number; timeMs: number; errors: number }[]
}): Promise<AttemptRecord> {
  const res = await fetch(`${BASE}/attempts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save attempt')
  return res.json()
}
