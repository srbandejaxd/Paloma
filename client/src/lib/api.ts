import { AttemptRecord, Block, Puzzle } from '../types'

const BASE = import.meta.env.VITE_SERVER_URL

function getToken(): string | null {
  try {
    const stored = localStorage.getItem('wp_user')
    return stored ? JSON.parse(stored).token : null
  } catch { return null }
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

export async function register(nickname: string, password: string): Promise<{ token: string; nickname: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error al registrar')
  return data
}

export async function loginApi(nickname: string, password: string): Promise<{ token: string; nickname: string }> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión')
  return data
}

// ─── BLOCKS ──────────────────────────────────────────────────────────────────

export async function fetchBlocks(): Promise<Block[]> {
  const res = await fetch(`${BASE}/api/blocks`)
  if (!res.ok) throw new Error('Failed to fetch blocks')
  return res.json()
}

// ─── PUZZLES ─────────────────────────────────────────────────────────────────

export async function fetchAllPuzzles(): Promise<Puzzle[]> {
  const res = await fetch(`${BASE}/api/puzzles`)
  if (!res.ok) throw new Error('Failed to fetch puzzles')
  return res.json()
}

export async function fetchPuzzlesForBlock(blockId: number): Promise<Puzzle[]> {
  const res = await fetch(`${BASE}/api/blocks/${blockId}/puzzles`)
  if (!res.ok) throw new Error('Failed to fetch puzzles')
  return res.json()
}

// ─── ATTEMPTS ────────────────────────────────────────────────────────────────

export async function fetchAttempts(blockId?: number): Promise<AttemptRecord[]> {
  const params = new URLSearchParams()
  if (blockId !== undefined) params.set('blockId', String(blockId))
  const res = await fetch(`${BASE}/api/attempts?${params}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch attempts')
  return res.json()
}

export async function saveAttempt(data: {
  blockId: number
  totalTimeMs: number
  solved: number
  totalPuzzles: number
  errors: number
  puzzleTimes: { puzzleId: number; orderInBlock: number; timeMs: number; errors: number }[]
}): Promise<AttemptRecord> {
  const res = await fetch(`${BASE}/api/attempts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save attempt')
  return res.json()
}

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────

export async function fetchLeaderboard(blockId: number): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${BASE}/api/leaderboard/${blockId}`)
  if (!res.ok) throw new Error('Failed to fetch leaderboard')
  return res.json()
}

export interface LeaderboardEntry {
  nickname: string
  bestScore: number
  bestTimeMs: number
  bestPpm: number
  totalCycles: number
  bestErrors: number
}
