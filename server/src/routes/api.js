const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { getDb } = require('../db/database')
const { authMiddleware, JWT_SECRET } = require('../middleware/auth')

// ─── AUTH ─────────────────────────────────────────────────────────────────────

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
      SELECT b.id, b.name, b.description, COUNT(p.id) as puzzleCount
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
    res.json(result.rows)
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }) }
})

router.post('/attempts', authMiddleware, async (req, res) => {
  const { blockId, totalTimeMs, solved, totalPuzzles, errors, puzzleTimes } = req.body
  if (!blockId) return res.status(400).json({ error: 'blockId requerido' })
  try {
    const db = getDb()
    const accuracy = solved > 0 ? Math.round((solved / (solved + (errors || 0))) * 100) : 0
    const ppm = totalTimeMs > 0 ? Math.round((solved / (totalTimeMs / 60000)) * 100) / 100 : 0
    const score = solved * 1000 - Math.round(totalTimeMs / 1000)

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
                   (SELECT a2.solved FROM attempts a2 WHERE a2.user_id = a.user_id AND a2.block_id = a.block_id ORDER BY a2.score DESC LIMIT 1) as bestSolved,
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

module.exports = router
