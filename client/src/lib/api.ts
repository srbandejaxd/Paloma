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
  bestSolved: number
  totalPuzzles: number
}
// ─── VISION ──────────────────────────────────────────────────────────────────

export async function saveVisionSession(data: { mode: string; score: number; errors: number; durationMs: number }): Promise<void> {
  const res = await fetch(`${BASE}/api/vision`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to save vision session')
}

export async function fetchVisionHistory(mode?: string): Promise<VisionSession[]> {
  const params = mode ? `?mode=${mode}` : ''
  const res = await fetch(`${BASE}/api/vision/history${params}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch vision history')
  return res.json()
}

export async function fetchVisionLeaderboard(mode: string): Promise<VisionLeaderboardEntry[]> {
  const res = await fetch(`${BASE}/api/vision/leaderboard/${mode}`)
  if (!res.ok) throw new Error('Failed to fetch vision leaderboard')
  return res.json()
}

export interface VisionSession {
  mode: string
  score: number
  errors: number
  durationMs: number
  createdAt: string
}

export interface VisionLeaderboardEntry {
  nickname: string
  bestScore: number
  bestErrors: number
  totalSessions: number
}

// ─── BLIND CHESS ─────────────────────────────────────────────────────────────

export interface BlindPuzzle {
  id: number
  orderNumber: number
  fen: string
  solution: string[]
  currentNumber: number
  completed: number
  total: number
}

export async function fetchBlindPuzzle(): Promise<BlindPuzzle> {
  const res = await fetch(`${BASE}/api/blind/puzzle`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch blind puzzle')
  return res.json()
}

export async function advanceBlindPuzzle(): Promise<{ ok: boolean; nextPuzzle: number; completed: number }> {
  const res = await fetch(`${BASE}/api/blind/advance`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to advance blind puzzle')
  return res.json()
}

// ─── CYCLES ──────────────────────────────────────────────────────────────────

export interface Macrocycle {
  id: number
  category: string
  status: 'active' | 'completed'
  hoursPerDay: number
  globalPuzzlePointer: number
  createdAt: string
  completedAt: string | null
  cycles?: Cycle[]
  reviewConfig?: ReviewConfig[]
}

export interface Cycle {
  id: number
  macrocycleId: number
  cycleNumber: number
  puzzleStart: number
  puzzleEnd: number | null
  status: 'active' | 'completed'
  createdAt: string
  completedAt: string | null
  reviews?: Review[]
}

export interface Review {
  id: number
  cycleId: number
  reviewNumber: number
  daysWork: number
  daysRest: number
  status: 'active' | 'completed' | 'failed'
  puzzlePointer: number
  createdAt: string
  completedAt: string | null
  failedAt: string | null
  sessions?: ReviewSession[]
}

export interface ReviewSession {
  id: number
  reviewId: number
  dayNumber: number
  startedAt: string
  endedAt: string | null
  puzzleStart: number
  puzzleEnd: number | null
  puzzlesSolved: number
  puzzlesAttempted: number
  status: 'active' | 'completed'
}

export interface ReviewConfig {
  reviewNumber: number
  daysWork: number
  daysRest: number
}

export interface CyclePuzzle {
  id: number
  fen: string
  solution: string[]
  subcategory: string | null
  blockId: number
  orderInBlock: number
}

export interface StartSessionResponse {
  sessionId: number
  dayNumber: number
  hoursPerDay: number
  puzzle: CyclePuzzle
  puzzleIndex: number
}

export interface PuzzleResponse {
  puzzle?: CyclePuzzle
  puzzleIndex?: number
  elapsedMs: number
  limitMs: number
  timeUp: boolean
  finished?: boolean
}

export interface SubmitResponse {
  sessionComplete: boolean
  nextPuzzle?: CyclePuzzle
  elapsedMs?: number
  limitMs?: number
  timeUp?: boolean
  poolFinished?: boolean
}

export interface EndSessionResponse {
  sessionComplete?: boolean
  daysDone?: number
  daysWork?: number
  reviewComplete?: boolean
  cycleComplete?: boolean
  macrocycleComplete?: boolean
  restDays?: number
}

// Listar macrociclos del usuario
export async function fetchMacrocycles(): Promise<Macrocycle[]> {
  const res = await fetch(`${BASE}/api/cycles/macrocycles`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch macrocycles')
  return res.json()
}

// Crear nuevo macrociclo
export async function createMacrocycle(data: {
  category: string
  hoursPerDay?: number
  reviewConfig?: { review_number: number; days_work: number; days_rest: number }[]
}): Promise<{ macrocycleId: number; cycleId: number }> {
  const res = await fetch(`${BASE}/api/cycles/macrocycles`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to create macrocycle')
  return json
}

// Detalle de un macrociclo (con ciclos y config)
export async function fetchMacrocycle(id: number): Promise<Macrocycle> {
  const res = await fetch(`${BASE}/api/cycles/macrocycles/${id}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch macrocycle')
  return res.json()
}

// Editar configuración de un macrociclo
export async function updateMacrocycleConfig(id: number, data: {
  hoursPerDay?: number
  reviewConfig?: { reviewNumber: number; daysWork: number; daysRest: number }[]
}): Promise<void> {
  const res = await fetch(`${BASE}/api/cycles/macrocycles/${id}/config`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update config')
}

// Detalle de un ciclo (con repasos)
export async function fetchCycle(id: number): Promise<Cycle & { reviews: Review[]; category: string; hoursPerDay: number }> {
  const res = await fetch(`${BASE}/api/cycles/cycles/${id}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch cycle')
  return res.json()
}

// Detalle de un repaso (con sesiones)
export async function fetchReview(id: number): Promise<Review & { sessions: ReviewSession[]; category: string; hoursPerDay: number; cycleStart: number }> {
  const res = await fetch(`${BASE}/api/cycles/reviews/${id}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch review')
  return res.json()
}

// Iniciar sesión del día
export async function startReviewSession(reviewId: number): Promise<StartSessionResponse> {
  const res = await fetch(`${BASE}/api/cycles/reviews/${reviewId}/start-session`, {
    method: 'POST',
    headers: authHeaders(),
  })
  const json = await res.json()
  if (!res.ok) {
    const err = new Error(json.error || 'Failed to start session') as Error & { data?: Record<string, unknown> }
    err.data = json
    throw err
  }
  return json
}

// Obtener puzzle actual de la sesión
export async function fetchSessionPuzzle(sessionId: number): Promise<PuzzleResponse> {
  const res = await fetch(`${BASE}/api/cycles/sessions/${sessionId}/puzzle`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch session puzzle')
  return res.json()
}

// Registrar puzzle completado
export async function submitSessionPuzzle(sessionId: number, data: {
  puzzleId: number
  attempts: number
  hintUsed: boolean
  timeMs: number
}): Promise<SubmitResponse> {
  const res = await fetch(`${BASE}/api/cycles/sessions/${sessionId}/submit`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to submit puzzle')
  return res.json()
}

// Terminar sesión (tiempo agotado, después del último puzzle)
export async function endReviewSession(sessionId: number): Promise<EndSessionResponse> {
  const res = await fetch(`${BASE}/api/cycles/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to end session')
  return res.json()
}

export async function restartReview(reviewId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/cycles/reviews/${reviewId}/restart`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Error al reiniciar repaso')
}

// ─── OPENINGS ────────────────────────────────────────────────────────────────

export interface Opening {
  id: number
  name: string
  createdAt: string
}

export interface OpeningNode {
  id: number
  parentId: number | null
  move: string
  fen: string
  moveNumber: number
  color: 'white' | 'black'
  orderIndex: number
}

export interface OpeningTree {
  id: number
  name: string
  color: 'white' | 'black'
  nodes: OpeningNode[]
}

export interface Repertoire {
  repertoireId: number
  color: 'white' | 'black'
  openings: Opening[]
}

export interface ImportNode {
  tempId: string
  parentTempId: string | null
  move: string
  fen: string
  moveNumber: number
  color: 'white' | 'black'
  orderIndex: number
}

// Obtener repertorio por color (crea uno si no existe)
export async function fetchRepertoire(color: 'white' | 'black'): Promise<Repertoire> {
  const res = await fetch(`${BASE}/api/openings/repertoires/${color}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch repertoire')
  return res.json()
}

// Crear apertura e importar árbol completo
export async function createOpening(data: {
  color: 'white' | 'black'
  name: string
  nodes: ImportNode[]
}): Promise<{ openingId: number; nodeCount: number }> {
  const res = await fetch(`${BASE}/api/openings`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to create opening')
  return json
}

// Obtener todos los nodos de una apertura
export async function fetchOpeningTree(openingId: number): Promise<OpeningTree> {
  const res = await fetch(`${BASE}/api/openings/${openingId}/nodes`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch opening tree')
  return res.json()
}

// Agregar nodos a una apertura existente
export async function addOpeningNodes(openingId: number, nodes: ImportNode[]): Promise<void> {
  const res = await fetch(`${BASE}/api/openings/${openingId}/nodes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ nodes }),
  })
  if (!res.ok) throw new Error('Failed to add nodes')
}

// Renombrar apertura
export async function renameOpening(openingId: number, name: string): Promise<void> {
  const res = await fetch(`${BASE}/api/openings/${openingId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to rename opening')
}

// Eliminar apertura
export async function deleteOpening(openingId: number): Promise<void> {
  const res = await fetch(`${BASE}/api/openings/${openingId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete opening')
}
