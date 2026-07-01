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
    const score = 20000 - ((errors || 0) * 1000) - Math.round(totalTimeMs / 1000)

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

module.exports = router
