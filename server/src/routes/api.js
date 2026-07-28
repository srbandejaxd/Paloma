const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { getDb } = require('../db/database')
const { authMiddleware, JWT_SECRET } = require('../middleware/auth')

// ─── AUTH ─────────────────────────────────────────────────────────────────────

router.get('/health', (req, res) => res.json({ ok: true }))
router.post('/auth/register', async (req, res) => {
  const { nickname, password } = req.body
  if (!nickname || !password) return res.status(400).json({ error: 'nickname y password requeridos' })
  if (nickname.length < 2) return res.status(400).json({ error: 'Nickname muy corto' })
  if (password.length < 4) return res.status(400).json({ error: 'Password muy corta (mínimo 4 caracteres)' })
  try {
    const db = getDb()
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE nickname = ?', args: [nickname] })
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Ese nickname ya está en uso' })
    const hash = await bcrypt.hash(password, 10)
    const result = await db.execute({ sql: 'INSERT INTO users (nickname, password_hash) VALUES (?, ?)', args: [nickname, hash] })
    const token = jwt.sign({ userId: Number(result.lastInsertRowid), nickname }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, nickname })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

router.post('/auth/login', async (req, res) => {
  const { nickname, password } = req.body
  if (!nickname || !password) return res.status(400).json({ error: 'nickname y password requeridos' })
  try {
    const db = getDb()
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE nickname = ?', args: [nickname] })
    if (result.rows.length === 0) return res.status(401).json({ error: 'Nickname o password incorrectos' })
    const user = result.rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Nickname o password incorrectos' })
    const token = jwt.sign({ userId: Number(user.id), nickname: user.nickname }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, nickname: user.nickname })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// ─── BLOCKS ───────────────────────────────────────────────────────────────────

router.get('/blocks', async (req, res) => {
  try {
    const db = getDb()
    const result = await db.execute(`
      SELECT b.id, b.name, b.description, b.category, b.subcategory, COUNT(p.id) as puzzleCount
      FROM blocks b LEFT JOIN puzzles p ON p.block_id = b.id
      GROUP BY b.id ORDER BY b.id
    `)
    res.json(result.rows)
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// ─── PUZZLES ──────────────────────────────────────────────────────────────────

router.get('/puzzles', async (req, res) => {
  try {
    const db = getDb()
    const result = await db.execute(`
      SELECT p.id, p.block_id as blockId, b.name as blockName,
             p.order_in_block as orderInBlock, p.fen, p.solution
      FROM puzzles p JOIN blocks b ON b.id = p.block_id
      ORDER BY p.block_id, p.order_in_block
    `)
    res.json(result.rows.map(p => ({ ...p, solution: JSON.parse(p.solution) })))
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

router.get('/blocks/:id/puzzles', async (req, res) => {
  try {
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT p.id, p.block_id as blockId, b.name as blockName,
                   p.order_in_block as orderInBlock, p.fen, p.solution
            FROM puzzles p JOIN blocks b ON b.id = p.block_id
            WHERE p.block_id = ? ORDER BY p.order_in_block`,
      args: [req.params.id],
    })
    res.json(result.rows.map(p => ({ ...p, solution: JSON.parse(p.solution) })))
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// ─── ATTEMPTS ─────────────────────────────────────────────────────────────────

router.get('/attempts', authMiddleware, async (req, res) => {
  try {
    const db = getDb()
    const { blockId } = req.query
    let sql = `
      SELECT a.id, a.user_id as userId, u.nickname, a.block_id as blockId,
             b.name as blockName, a.attempt_number as attemptNumber,
             a.total_time_ms as totalTimeMs, a.solved, a.total_puzzles as totalPuzzles,
             a.errors, a.accuracy, a.ppm, a.score, a.created_at as createdAt
      FROM attempts a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN blocks b ON b.id = a.block_id
      WHERE a.user_id = ?
    `
    const args = [req.user.userId]
    if (blockId) { sql += ' AND a.block_id = ?'; args.push(blockId) }
    sql += ' ORDER BY a.created_at ASC'
    const result = await db.execute({ sql, args })
    const attempts = result.rows

    const failedResult = await db.execute({
      sql: `SELECT pt.attempt_id as attemptId, pt.puzzle_id as puzzleId, pt.order_in_block as orderInBlock, pt.errors
            FROM puzzle_times pt
            WHERE pt.attempt_id IN (${attempts.map(() => '?').join(',') || 'NULL'}) AND pt.errors > 0`,
      args: attempts.map(a => a.id)
    })

    const failedByAttempt = failedResult.rows.reduce((acc, row) => {
      if (!acc[row.attemptId]) acc[row.attemptId] = []
      acc[row.attemptId].push({ puzzleId: row.puzzleId, orderInBlock: row.orderInBlock, errors: row.errors })
      return acc
    }, {})

    res.json(attempts.map(a => ({ ...a, failedPuzzles: failedByAttempt[a.id] || [] })))
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

router.post('/attempts', authMiddleware, async (req, res) => {
  const { blockId, totalTimeMs, solved, totalPuzzles, errors, puzzleTimes } = req.body
  if (!blockId) return res.status(400).json({ error: 'blockId requerido' })
  try {
    const db = getDb()
    const accuracy = solved > 0 ? Math.round((solved / (solved + (errors || 0))) * 100) : 0
    const ppm = totalTimeMs > 0 ? Math.round((solved / (totalTimeMs / 60000)) * 100) / 100 : 0
    const score = 1000 * solved - (totalTimeMs / 1000)

    const prevResult = await db.execute({
      sql: 'SELECT MAX(attempt_number) as maxAttempt FROM attempts WHERE user_id = ? AND block_id = ?',
      args: [req.user.userId, blockId],
    })
    const attemptNumber = (Number(prevResult.rows[0].maxAttempt) || 0) + 1

    const insertResult = await db.execute({
      sql: `INSERT INTO attempts (user_id, block_id, attempt_number, total_time_ms, solved, total_puzzles, errors, accuracy, ppm, score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [req.user.userId, blockId, attemptNumber, totalTimeMs, solved, totalPuzzles, errors || 0, accuracy, ppm, score],
    })
    const attemptId = Number(insertResult.lastInsertRowid)

    if (puzzleTimes?.length) {
      for (const pt of puzzleTimes) {
        await db.execute({
          sql: 'INSERT INTO puzzle_times (attempt_id, puzzle_id, order_in_block, time_ms, errors) VALUES (?, ?, ?, ?, ?)',
          args: [attemptId, pt.puzzleId, pt.orderInBlock, pt.timeMs, pt.errors || 0],
        })
      }
    }

    const final = await db.execute({
      sql: `SELECT a.id, u.nickname, a.block_id as blockId, b.name as blockName,
                   a.attempt_number as attemptNumber, a.total_time_ms as totalTimeMs,
                   a.solved, a.total_puzzles as totalPuzzles, a.errors, a.accuracy, a.ppm, a.score,
                   a.created_at as createdAt
            FROM attempts a JOIN users u ON u.id = a.user_id LEFT JOIN blocks b ON b.id = a.block_id
            WHERE a.id = ?`,
      args: [attemptId],
    })
    res.json(final.rows[0])
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────

router.get('/leaderboard/:blockId', async (req, res) => {
  try {
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT u.nickname,
                   MAX(a.score) as bestScore,
                   MIN(a.total_time_ms) as bestTimeMs,
                   MAX(a.ppm) as bestPpm,
                   COUNT(a.id) as totalCycles,
                   MIN(a.errors) as bestErrors,
                   (SELECT a2.total_puzzles - a2.errors FROM attempts a2 WHERE a2.user_id = a.user_id AND a2.block_id = a.block_id ORDER BY a2.score DESC LIMIT 1) as bestSolved,
                   a.total_puzzles as totalPuzzles
            FROM attempts a JOIN users u ON u.id = a.user_id
            WHERE a.block_id = ?
            GROUP BY a.user_id
            ORDER BY bestScore DESC
            LIMIT 20`,
      args: [req.params.blockId],
    })
    res.json(result.rows)
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// ─── VISION ───────────────────────────────────────────────────────────────────
router.post('/vision', authMiddleware, async (req, res) => {
  const { mode, score, errors, durationMs } = req.body
  if (!mode || score === undefined) return res.status(400).json({ error: 'Datos incompletos' })
  const db = getDb()
  try {
    await db.execute({
      sql: 'INSERT INTO vision_sessions (user_id, mode, score, errors, duration_ms) VALUES (?, ?, ?, ?, ?)',
      args: [req.user.userId, mode, score, errors ?? 0, durationMs ?? 60000],
    })
    res.json({ ok: true })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

router.get('/vision/history', authMiddleware, async (req, res) => {
  const { mode } = req.query
  const db = getDb()
  try {
    const result = await db.execute({
      sql: `SELECT mode, score, errors, duration_ms as durationMs, created_at as createdAt
            FROM vision_sessions WHERE user_id = ? ${mode ? 'AND mode = ?' : ''}
            ORDER BY created_at DESC LIMIT 50`,
      args: mode ? [req.user.userId, mode] : [req.user.userId],
    })
    res.json(result.rows)
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

router.get('/vision/leaderboard/:mode', async (req, res) => {
  const db = getDb()
  try {
    const result = await db.execute({
      sql: `SELECT u.nickname, MAX(v.score) as bestScore, MIN(v.errors) as bestErrors, COUNT(*) as totalSessions
            FROM vision_sessions v JOIN users u ON u.id = v.user_id
            WHERE v.mode = ?
            GROUP BY v.user_id ORDER BY bestScore DESC LIMIT 20`,
      args: [req.params.mode],
    })
    res.json(result.rows)
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})
// ─── BLIND CHESS ──────────────────────────────────────────────────────────────

router.get('/blind/puzzle', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    // Obtener o crear progreso del usuario
    let progress = await db.execute({
      sql: 'SELECT current_puzzle, completed FROM blind_progress WHERE user_id = ?',
      args: [req.user.userId]
    })
    if (progress.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO blind_progress (user_id, current_puzzle) VALUES (?, 1)',
        args: [req.user.userId]
      })
      progress = await db.execute({
        sql: 'SELECT current_puzzle, completed FROM blind_progress WHERE user_id = ?',
        args: [req.user.userId]
      })
    }
    const { current_puzzle, completed } = progress.rows[0]
    const puzzle = await db.execute({
      sql: 'SELECT id, order_number as orderNumber, fen, solution FROM blind_puzzles WHERE order_number = ?',
      args: [current_puzzle]
    })
    if (puzzle.rows.length === 0) return res.status(404).json({ error: 'Puzzle no encontrado' })
    const p = puzzle.rows[0]
    res.json({ ...p, solution: JSON.parse(p.solution), currentNumber: current_puzzle, completed, total: 1000 })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

router.post('/blind/advance', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const progress = await db.execute({
      sql: 'SELECT current_puzzle FROM blind_progress WHERE user_id = ?',
      args: [req.user.userId]
    })
    if (progress.rows.length === 0) return res.status(404).json({ error: 'Sin progreso' })
    const current = progress.rows[0].current_puzzle
    const next = current + 1
    const completed = next > 1000 ? 1 : 0
    await db.execute({
      sql: 'UPDATE blind_progress SET current_puzzle = ?, completed = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      args: [Math.min(next, 1000), completed, req.user.userId]
    })
    res.json({ ok: true, nextPuzzle: Math.min(next, 1000), completed })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})


// ─── CYCLES ───────────────────────────────────────────────────────────────────

// Obtener pool de puzzles ordenado por categoría (secuencia lineal para ciclos)
async function getCyclePuzzles(db, category, offset, limit) {
  const result = await db.execute({
    sql: `SELECT p.id, p.fen, p.solution, b.subcategory,
                 p.block_id as blockId, p.order_in_block as orderInBlock
          FROM puzzles p
          JOIN blocks b ON p.block_id = b.id
          WHERE b.category = ?
          ORDER BY b.id ASC, p.order_in_block ASC
          LIMIT ? OFFSET ?`,
    args: [category, limit, offset]
  })
  return result.rows.map(p => ({ ...p, solution: JSON.parse(p.solution) }))
}

async function getCyclePuzzleCount(db, category) {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as total FROM puzzles p JOIN blocks b ON p.block_id = b.id WHERE b.category = ?`,
    args: [category]
  })
  return Number(result.rows[0].total)
}

const DEFAULT_REVIEW_CONFIG = [
  { review_number: 1, days_work: 7, days_rest: 3 },
  { review_number: 2, days_work: 5, days_rest: 2 },
  { review_number: 3, days_work: 3, days_rest: 1 },
  { review_number: 4, days_work: 1, days_rest: 0 },
]

// GET /cycles/macrocycles — listar macrociclos del usuario
router.get('/cycles/macrocycles', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const result = await db.execute({
      sql: `SELECT id, category, status, hours_per_day as hoursPerDay,
                   global_puzzle_pointer as globalPuzzlePointer,
                   created_at as createdAt, completed_at as completedAt
            FROM macrocycles WHERE user_id = ? ORDER BY created_at DESC`,
      args: [req.user.userId]
    })
    res.json(result.rows)
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// POST /cycles/macrocycles — crear nuevo macrociclo
router.post('/cycles/macrocycles', authMiddleware, async (req, res) => {
  const { category, hoursPerDay = 2, reviewConfig } = req.body
  if (!category) return res.status(400).json({ error: 'category requerido' })
  const db = getDb()
  try {
    // Solo 1 macrociclo activo por categoría
    const existing = await db.execute({
      sql: `SELECT id FROM macrocycles WHERE user_id = ? AND category = ? AND status = 'active'`,
      args: [req.user.userId, category]
    })
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Ya tienes un macrociclo activo para esta categoría' })

    const result = await db.execute({
      sql: `INSERT INTO macrocycles (user_id, category, hours_per_day) VALUES (?, ?, ?)`,
      args: [req.user.userId, category, hoursPerDay]
    })
    const macrocycleId = Number(result.lastInsertRowid)

    // Insertar configuración de repasos (default o custom)
    const config = reviewConfig || DEFAULT_REVIEW_CONFIG
    for (const rc of config) {
      await db.execute({
        sql: `INSERT INTO review_config (macrocycle_id, review_number, days_work, days_rest) VALUES (?, ?, ?, ?)`,
        args: [macrocycleId, rc.review_number, rc.days_work, rc.days_rest]
      })
    }

    // Crear el primer ciclo
    const cycleResult = await db.execute({
      sql: `INSERT INTO cycles (macrocycle_id, cycle_number, puzzle_start) VALUES (?, 1, 0)`,
      args: [macrocycleId]
    })
    const cycleId = Number(cycleResult.lastInsertRowid)

    // Crear el primer repaso con la config
    await db.execute({
      sql: `INSERT INTO reviews (cycle_id, review_number, days_work, days_rest, puzzle_pointer)
            VALUES (?, 1, ?, ?, 0)`,
      args: [cycleId, config[0].days_work, config[0].days_rest]
    })

    res.json({ macrocycleId, cycleId })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// GET /cycles/macrocycles/:id — detalle completo de un macrociclo
router.get('/cycles/macrocycles/:id', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const macro = await db.execute({
      sql: `SELECT id, category, status, hours_per_day as hoursPerDay,
                   global_puzzle_pointer as globalPuzzlePointer,
                   created_at as createdAt, completed_at as completedAt
            FROM macrocycles WHERE id = ? AND user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (macro.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })

    const cycles = await db.execute({
      sql: `SELECT id, cycle_number as cycleNumber, puzzle_start as puzzleStart,
                   puzzle_end as puzzleEnd, status, created_at as createdAt, completed_at as completedAt
            FROM cycles WHERE macrocycle_id = ? ORDER BY cycle_number ASC`,
      args: [req.params.id]
    })

    const config = await db.execute({
      sql: `SELECT review_number as reviewNumber, days_work as daysWork, days_rest as daysRest
            FROM review_config WHERE macrocycle_id = ? ORDER BY review_number ASC`,
      args: [req.params.id]
    })

    res.json({ ...macro.rows[0], cycles: cycles.rows, reviewConfig: config.rows })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// GET /cycles/cycles/:id — detalle de un ciclo con sus repasos
router.get('/cycles/cycles/:id', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const cycle = await db.execute({
      sql: `SELECT c.id, c.macrocycle_id as macrocycleId, c.cycle_number as cycleNumber,
                   c.puzzle_start as puzzleStart, c.puzzle_end as puzzleEnd,
                   c.status, m.category, m.hours_per_day as hoursPerDay
            FROM cycles c JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE c.id = ? AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (cycle.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })

    const reviews = await db.execute({
      sql: `SELECT id, review_number as reviewNumber, days_work as daysWork, days_rest as daysRest,
                   status, puzzle_pointer as puzzlePointer,
                   created_at as createdAt, completed_at as completedAt, failed_at as failedAt
            FROM reviews WHERE cycle_id = ? ORDER BY review_number ASC`,
      args: [req.params.id]
    })

    res.json({ ...cycle.rows[0], reviews: reviews.rows })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// GET /cycles/reviews/:id — detalle de un repaso con sesiones
router.get('/cycles/reviews/:id', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const review = await db.execute({
      sql: `SELECT r.id, r.cycle_id as cycleId, r.review_number as reviewNumber,
                   r.days_work as daysWork, r.days_rest as daysRest,
                   r.status, r.puzzle_pointer as puzzlePointer,
                   r.created_at as createdAt, r.completed_at as completedAt, r.failed_at as failedAt,
                   c.puzzle_start as cycleStart, c.macrocycle_id as macrocycleId, m.category, m.hours_per_day as hoursPerDay
            FROM reviews r
            JOIN cycles c ON c.id = r.cycle_id
            JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE r.id = ? AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (review.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })

    const sessions = await db.execute({
      sql: `SELECT id, day_number as dayNumber, started_at as startedAt, ended_at as endedAt,
                   puzzle_start as puzzleStart, puzzle_end as puzzleEnd,
                   puzzles_solved as puzzlesSolved, puzzles_attempted as puzzlesAttempted, status
            FROM review_sessions WHERE review_id = ? ORDER BY day_number ASC`,
      args: [req.params.id]
    })

    res.json({ ...review.rows[0], sessions: sessions.rows })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// POST /cycles/reviews/:id/force-close-session — cerrar sesión abandonada
router.post('/cycles/reviews/:id/force-close-session', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const activeSession = await db.execute({
      sql: `SELECT rs.id FROM review_sessions rs
            JOIN reviews r ON r.id = rs.review_id
            JOIN cycles c ON c.id = r.cycle_id
            JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE rs.review_id = ? AND rs.status = 'active' AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (activeSession.rows.length === 0) return res.status(404).json({ error: 'No hay sesión activa' })
    await db.execute({
      sql: `UPDATE review_sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [activeSession.rows[0].id]
    })
    res.json({ ok: true })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// POST /cycles/reviews/:id/restart — reactivar un repaso fallido
router.post('/cycles/reviews/:id/restart', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const review = await db.execute({
      sql: `SELECT r.id, r.status, c.puzzle_start as cycleStart
            FROM reviews r
            JOIN cycles c ON c.id = r.cycle_id
            JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE r.id = ? AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (review.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })
    const r = review.rows[0]
    if (r.status !== 'failed') return res.status(400).json({ error: 'El repaso no está cancelado' })

    // Borrar todas las sesiones para que el historial quede limpio
    await db.execute({
      sql: `DELETE FROM review_sessions WHERE review_id = ?`,
      args: [req.params.id]
    })
    // Reactivar y resetear puzzle_pointer al inicio del ciclo
    await db.execute({
      sql: `UPDATE reviews SET status = 'active', failed_at = NULL, completed_at = NULL, puzzle_pointer = ? WHERE id = ?`,
      args: [r.cycleStart, req.params.id]
    })
    res.json({ ok: true })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// POST /cycles/reviews/:id/start-session — iniciar sesión del día
router.post('/cycles/reviews/:id/start-session', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const review = await db.execute({
      sql: `SELECT r.id, r.status, r.puzzle_pointer as puzzlePointer, r.days_work as daysWork,
                   r.days_rest as daysRest, c.puzzle_start as cycleStart, m.category, m.hours_per_day as hoursPerDay
            FROM reviews r
            JOIN cycles c ON c.id = r.cycle_id
            JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE r.id = ? AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (review.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })
    const r = review.rows[0]

    if (r.status !== 'active') return res.status(400).json({ error: `Repaso ${r.status}` })

    // Verificar que no hay sesión activa ya
    const activeSession = await db.execute({
      sql: `SELECT id, started_at as startedAt FROM review_sessions WHERE review_id = ? AND status = 'active'`,
      args: [req.params.id]
    })
    if (activeSession.rows.length > 0) {
      const staleSession = activeSession.rows[0]
      const ageMs = Date.now() - new Date(staleSession.startedAt).getTime()
      // Si lleva más de hoursPerDay + 1 hora, se considera abandonada y se cierra
      if (ageMs > (Number(r.hoursPerDay) + 1) * 3600 * 1000) {
        await db.execute({
          sql: `UPDATE review_sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [staleSession.id]
        })
      } else {
        return res.status(409).json({ error: 'Ya hay una sesión activa', sessionId: staleSession.id })
      }
    }

    // Verificar ventana de tiempo (24h desde última sesión completada)
    const lastSession = await db.execute({
      sql: `SELECT started_at as startedAt FROM review_sessions WHERE review_id = ? AND status = 'completed' ORDER BY day_number DESC LIMIT 1`,
      args: [req.params.id]
    })
    if (lastSession.rows.length > 0) {
      const lastStart = new Date(lastSession.rows[0].startedAt)
      const nextAvailable = new Date(lastStart.getTime() + 24 * 60 * 60 * 1000)
      if (new Date() < nextAvailable) {
        return res.status(425).json({
          error: 'Sesión no disponible aún',
          availableAt: nextAvailable.toISOString()
        })
      }

      // Verificar límite de 48h (gracia)
      const graceEnd = new Date(nextAvailable.getTime() + 48 * 60 * 60 * 1000)
      if (new Date() > graceEnd) {
        // Cancelar el repaso
        await db.execute({
          sql: `UPDATE reviews SET status = 'failed', failed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [req.params.id]
        })
        return res.status(410).json({ error: 'Repaso cancelado por inactividad' })
      }
    }

    // Contar sesiones existentes para el número de día
    const sessionCount = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM review_sessions WHERE review_id = ?`,
      args: [req.params.id]
    })
    const dayNumber = Number(sessionCount.rows[0].cnt) + 1

    if (dayNumber > r.daysWork) return res.status(400).json({ error: 'Ya completaste todos los días de este repaso' })

    // Crear la sesión
    const puzzleStart = Number(r.puzzlePointer)
    const absoluteStart = Number(r.cycleStart) + puzzleStart

    const sessionResult = await db.execute({
      sql: `INSERT INTO review_sessions (review_id, day_number, started_at, puzzle_start, status)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'active')`,
      args: [req.params.id, dayNumber, puzzleStart]
    })
    const sessionId = Number(sessionResult.lastInsertRowid)

    // Obtener el primer puzzle
    const puzzles = await getCyclePuzzles(db, r.category, absoluteStart, 1)
    if (puzzles.length === 0) return res.status(404).json({ error: 'No hay más puzzles' })

    res.json({
      sessionId,
      dayNumber,
      hoursPerDay: r.hoursPerDay,
      puzzle: puzzles[0],
      puzzleIndex: absoluteStart
    })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// GET /cycles/sessions/:id/puzzle — obtener puzzle actual de la sesión
router.get('/cycles/sessions/:id/puzzle', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const session = await db.execute({
      sql: `SELECT rs.id, rs.review_id as reviewId, rs.puzzle_start as puzzleStart,
                   rs.puzzles_attempted as puzzlesAttempted, rs.status,
                   rs.started_at as startedAt, m.hours_per_day as hoursPerDay, m.category,
                   c.puzzle_start as cycleStart
            FROM review_sessions rs
            JOIN reviews r ON r.id = rs.review_id
            JOIN cycles c ON c.id = r.cycle_id
            JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE rs.id = ? AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (session.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })
    const s = session.rows[0]

    if (s.status !== 'active') return res.status(400).json({ error: 'Sesión no activa' })

    // Verificar tiempo límite
    const startedAt = new Date(s.startedAt)
    const elapsedMs = Date.now() - startedAt.getTime()
    const limitMs = s.hoursPerDay * 60 * 60 * 1000
    if (elapsedMs >= limitMs) {
      return res.status(200).json({ timeUp: true, elapsedMs, limitMs })
    }

    const absoluteOffset = Number(s.cycleStart) + Number(s.puzzleStart) + Number(s.puzzlesAttempted)
    const puzzles = await getCyclePuzzles(db, s.category, absoluteOffset, 1)
    if (puzzles.length === 0) return res.json({ finished: true })

    res.json({
      puzzle: puzzles[0],
      puzzleIndex: absoluteOffset,
      elapsedMs,
      limitMs,
      timeUp: false
    })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// POST /cycles/sessions/:id/submit — registrar resultado de un puzzle
router.post('/cycles/sessions/:id/submit', authMiddleware, async (req, res) => {
  const { puzzleId, attempts, hintUsed, timeMs } = req.body
  const db = getDb()
  try {
    const session = await db.execute({
      sql: `SELECT rs.id, rs.review_id as reviewId, rs.puzzle_start as puzzleStart,
                   rs.puzzles_attempted as puzzlesAttempted, rs.puzzles_solved as puzzlesSolved,
                   rs.status, rs.started_at as startedAt,
                   m.hours_per_day as hoursPerDay, m.category, c.puzzle_start as cycleStart,
                   r.days_work as daysWork, r.puzzle_pointer as reviewPointer
            FROM review_sessions rs
            JOIN reviews r ON r.id = rs.review_id
            JOIN cycles c ON c.id = r.cycle_id
            JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE rs.id = ? AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (session.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })
    const s = session.rows[0]
    if (s.status !== 'active') return res.status(400).json({ error: 'Sesión no activa' })

    const orderInSession = Number(s.puzzlesAttempted) + 1

    // Registrar puzzle
    await db.execute({
      sql: `INSERT INTO session_puzzles (session_id, puzzle_id, order_in_session, attempts, hint_used, time_ms)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [req.params.id, puzzleId, orderInSession, attempts || 1, hintUsed ? 1 : 0, timeMs || 0]
    })

    const newAttempted = Number(s.puzzlesAttempted) + 1
    const newSolved = Number(s.puzzlesSolved) + 1

    // Actualizar sesión
    await db.execute({
      sql: `UPDATE review_sessions SET puzzles_attempted = ?, puzzles_solved = ? WHERE id = ?`,
      args: [newAttempted, newSolved, req.params.id]
    })

    // Actualizar puzzle_pointer del repaso
    const newReviewPointer = Number(s.reviewPointer) + 1
    await db.execute({
      sql: `UPDATE reviews SET puzzle_pointer = ? WHERE id = ?`,
      args: [newReviewPointer, s.reviewId]
    })

    // Verificar si se acabó el tiempo o no hay más puzzles
    const startedAt = new Date(s.startedAt)
    const elapsedMs = Date.now() - startedAt.getTime()
    const limitMs = s.hoursPerDay * 60 * 60 * 1000
    const timeUp = elapsedMs >= limitMs

    // Verificar si hay más puzzles
    const nextOffset = Number(s.cycleStart) + Number(s.puzzleStart) + newAttempted
    const nextPuzzles = await getCyclePuzzles(db, s.category, nextOffset, 1)
    const poolFinished = nextPuzzles.length === 0

    if (timeUp || poolFinished) {
      // Terminar la sesión
      await db.execute({
        sql: `UPDATE review_sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP, puzzle_end = ? WHERE id = ?`,
        args: [newReviewPointer - 1, req.params.id]
      })
      return res.json({ sessionComplete: true, timeUp, poolFinished })
    }

    res.json({
      sessionComplete: false,
      nextPuzzle: nextPuzzles[0],
      elapsedMs,
      limitMs
    })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// POST /cycles/sessions/:id/end — terminar sesión manualmente (tiempo agotado)
router.post('/cycles/sessions/:id/end', authMiddleware, async (req, res) => {
  const db = getDb()
  try {
    const session = await db.execute({
      sql: `SELECT rs.id, rs.review_id as reviewId, rs.puzzles_attempted as puzzlesAttempted,
                   rs.puzzle_start as puzzleStart, rs.status,
                   r.puzzle_pointer as reviewPointer, r.days_work as daysWork,
                   r.review_number as reviewNumber, c.id as cycleId, c.puzzle_start as cycleStart,
                   c.macrocycle_id as macrocycleId, m.category
            FROM review_sessions rs
            JOIN reviews r ON r.id = rs.review_id
            JOIN cycles c ON c.id = r.cycle_id
            JOIN macrocycles m ON m.id = c.macrocycle_id
            WHERE rs.id = ? AND m.user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (session.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })
    const s = session.rows[0]
    if (s.status !== 'active') return res.status(400).json({ error: 'Sesión ya terminada' })

    // Cerrar sesión
    await db.execute({
      sql: `UPDATE review_sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP, puzzle_end = ? WHERE id = ?`,
      args: [Number(s.reviewPointer) - 1, req.params.id]
    })

    // Verificar si el repaso está completo (todos los días hechos)
    const completedSessions = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM review_sessions WHERE review_id = ? AND status = 'completed'`,
      args: [s.reviewId]
    })
    const daysDone = Number(completedSessions.rows[0].cnt)

    if (daysDone >= Number(s.daysWork)) {
      // Completar el repaso
      await db.execute({
        sql: `UPDATE reviews SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [s.reviewId]
      })

      // Verificar si hay más repasos configurados
      const nextReviewConfig = await db.execute({
        sql: `SELECT review_number as reviewNumber, days_work as daysWork, days_rest as daysRest
              FROM review_config WHERE macrocycle_id = ? AND review_number = ?`,
        args: [s.macrocycleId, Number(s.reviewNumber) + 1]
      })

      if (nextReviewConfig.rows.length > 0) {
        const nc = nextReviewConfig.rows[0]
        // Crear siguiente repaso (pointer vuelve a 0 — empieza desde el inicio del tramo)
        await db.execute({
          sql: `INSERT INTO reviews (cycle_id, review_number, days_work, days_rest, puzzle_pointer)
                VALUES (?, ?, ?, ?, 0)`,
          args: [s.cycleId, nc.reviewNumber, nc.daysWork, nc.daysRest]
        })
        return res.json({ reviewComplete: true, cycleComplete: false, restDays: s.daysRest })
      } else {
        // Todos los repasos del ciclo completos → completar ciclo
        const maxPointer = Number(s.cycleStart) + Number(s.reviewPointer)
        await db.execute({
          sql: `UPDATE cycles SET status = 'completed', puzzle_end = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
          args: [maxPointer, s.cycleId]
        })
        // Actualizar puntero global del macrociclo
        await db.execute({
          sql: `UPDATE macrocycles SET global_puzzle_pointer = ? WHERE id = ?`,
          args: [maxPointer, s.macrocycleId]
        })
        // Verificar si hay más puzzles (crear nuevo ciclo)
        const totalPuzzles = await getCyclePuzzleCount(db, s.category)
        if (maxPointer < totalPuzzles) {
          const cycleCount = await db.execute({
            sql: `SELECT COUNT(*) as cnt FROM cycles WHERE macrocycle_id = ?`,
            args: [s.macrocycleId]
          })
          const nextCycleNumber = Number(cycleCount.rows[0].cnt) + 1
          const cycleResult = await db.execute({
            sql: `INSERT INTO cycles (macrocycle_id, cycle_number, puzzle_start) VALUES (?, ?, ?)`,
            args: [s.macrocycleId, nextCycleNumber, maxPointer]
          })
          const firstConfig = await db.execute({
            sql: `SELECT days_work as daysWork, days_rest as daysRest FROM review_config WHERE macrocycle_id = ? AND review_number = 1`,
            args: [s.macrocycleId]
          })
          const fc = firstConfig.rows[0]
          await db.execute({
            sql: `INSERT INTO reviews (cycle_id, review_number, days_work, days_rest, puzzle_pointer) VALUES (?, 1, ?, ?, 0)`,
            args: [Number(cycleResult.lastInsertRowid), fc.daysWork, fc.daysRest]
          })
          return res.json({ reviewComplete: true, cycleComplete: true, macrocycleComplete: false })
        } else {
          // Macrociclo completo
          await db.execute({
            sql: `UPDATE macrocycles SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [s.macrocycleId]
          })
          return res.json({ reviewComplete: true, cycleComplete: true, macrocycleComplete: true })
        }
      }
    }

    res.json({ sessionComplete: true, daysDone, daysWork: s.daysWork })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

// PUT /cycles/macrocycles/:id/config — editar configuración de repasos
router.put('/cycles/macrocycles/:id/config', authMiddleware, async (req, res) => {
  const { reviewConfig, hoursPerDay } = req.body
  const db = getDb()
  try {
    const macro = await db.execute({
      sql: `SELECT id FROM macrocycles WHERE id = ? AND user_id = ?`,
      args: [req.params.id, req.user.userId]
    })
    if (macro.rows.length === 0) return res.status(404).json({ error: 'No encontrado' })

    if (hoursPerDay) {
      await db.execute({
        sql: `UPDATE macrocycles SET hours_per_day = ? WHERE id = ?`,
        args: [hoursPerDay, req.params.id]
      })
    }

    if (reviewConfig?.length) {
      await db.execute({
        sql: `DELETE FROM review_config WHERE macrocycle_id = ?`,
        args: [req.params.id]
      })
      for (const rc of reviewConfig) {
        await db.execute({
          sql: `INSERT INTO review_config (macrocycle_id, review_number, days_work, days_rest) VALUES (?, ?, ?, ?)`,
          args: [req.params.id, rc.reviewNumber, rc.daysWork, rc.daysRest]
        })
      }
    }

    res.json({ ok: true })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})


module.exports = router
