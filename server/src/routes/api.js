const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { getDb } = require('../db/database')
const { authMiddleware, JWT_SECRET } = require('../middleware/auth')

// ─── AUTH ────────────────────────────────────────────────────────────────────

router.post('/auth/register', async (req, res) => {
  const { nickname, password } = req.body
  if (!nickname || !password) return res.status(400).json({ error: 'nickname y password requeridos' })
  if (nickname.length < 2) return res.status(400).json({ error: 'Nickname muy corto' })
  if (password.length < 4) return res.status(400).json({ error: 'Password muy corta (mínimo 4 caracteres)' })

  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE nickname = ?').get(nickname)
  if (existing) return res.status(409).json({ error: 'Ese nickname ya está en uso' })

  const hash = await bcrypt.hash(password, 10)
  const result = db.prepare('INSERT INTO users (nickname, password_hash) VALUES (?, ?)').run(nickname, hash)
  const token = jwt.sign({ userId: result.lastInsertRowid, nickname }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, nickname })
})

router.post('/auth/login', async (req, res) => {
  const { nickname, password } = req.body
  if (!nickname || !password) return res.status(400).json({ error: 'nickname y password requeridos' })

  const db = getDb()
  const user = db.prepare('SELECT * FROM users WHERE nickname = ?').get(nickname)
  if (!user) return res.status(401).json({ error: 'Nickname o password incorrectos' })

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: 'Nickname o password incorrectos' })

  const token = jwt.sign({ userId: user.id, nickname: user.nickname }, JWT_SECRET, { expiresIn: '30d' })
  res.json({ token, nickname: user.nickname })
})

// ─── BLOCKS ──────────────────────────────────────────────────────────────────

router.get('/blocks', (req, res) => {
  const db = getDb()
  const blocks = db.prepare(`
    SELECT b.id, b.name, b.description, COUNT(p.id) as puzzleCount
    FROM blocks b
    LEFT JOIN puzzles p ON p.block_id = b.id
    GROUP BY b.id ORDER BY b.id
  `).all()
  res.json(blocks)
})

// ─── PUZZLES ─────────────────────────────────────────────────────────────────

router.get('/puzzles', (req, res) => {
  const db = getDb()
  const puzzles = db.prepare(`
    SELECT p.id, p.block_id as blockId, b.name as blockName,
           p.order_in_block as orderInBlock, p.fen, p.solution
    FROM puzzles p JOIN blocks b ON b.id = p.block_id
    ORDER BY p.block_id, p.order_in_block
  `).all()
  res.json(puzzles.map(p => ({ ...p, solution: JSON.parse(p.solution) })))
})

router.get('/blocks/:id/puzzles', (req, res) => {
  const db = getDb()
  const puzzles = db.prepare(`
    SELECT p.id, p.block_id as blockId, b.name as blockName,
           p.order_in_block as orderInBlock, p.fen, p.solution
    FROM puzzles p JOIN blocks b ON b.id = p.block_id
    WHERE p.block_id = ? ORDER BY p.order_in_block
  `).all(req.params.id)
  res.json(puzzles.map(p => ({ ...p, solution: JSON.parse(p.solution) })))
})

// ─── ATTEMPTS ────────────────────────────────────────────────────────────────

// GET /api/attempts — historial del usuario autenticado
router.get('/attempts', authMiddleware, (req, res) => {
  const db = getDb()
  const { blockId } = req.query
  let query = `
    SELECT a.id, a.user_id as userId, u.nickname, a.block_id as blockId,
           b.name as blockName, a.attempt_number as attemptNumber,
           a.total_time_ms as totalTimeMs, a.solved, a.total_puzzles as totalPuzzles,
           a.errors, a.accuracy, a.ppm, a.created_at as createdAt
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    LEFT JOIN blocks b ON b.id = a.block_id
    WHERE a.user_id = ?
  `
  const params = [req.user.userId]
  if (blockId) { query += ' AND a.block_id = ?'; params.push(blockId) }
  query += ' ORDER BY a.created_at ASC'
  res.json(db.prepare(query).all(...params))
})

// POST /api/attempts — guardar un cycle completado
router.post('/attempts', authMiddleware, (req, res) => {
  const db = getDb()
  const { blockId, totalTimeMs, solved, totalPuzzles, errors, puzzleTimes } = req.body
  if (!blockId) return res.status(400).json({ error: 'blockId requerido' })

  const accuracy = solved > 0 ? Math.round((solved / (solved + (errors || 0))) * 100) : 0
  const ppm = totalTimeMs > 0 ? Math.round((solved / (totalTimeMs / 60000)) * 100) / 100 : 0

  const prev = db.prepare(
    'SELECT MAX(attempt_number) as maxAttempt FROM attempts WHERE user_id = ? AND block_id = ?'
  ).get(req.user.userId, blockId)
  const attemptNumber = (prev.maxAttempt || 0) + 1

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO attempts (user_id, block_id, attempt_number, total_time_ms, solved, total_puzzles, errors, accuracy, ppm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.userId, blockId, attemptNumber, totalTimeMs, solved, totalPuzzles, errors || 0, accuracy, ppm)

    const attemptId = result.lastInsertRowid
    if (puzzleTimes?.length) {
      const ins = db.prepare(
        'INSERT INTO puzzle_times (attempt_id, puzzle_id, order_in_block, time_ms, errors) VALUES (?, ?, ?, ?, ?)'
      )
      for (const pt of puzzleTimes) {
        ins.run(attemptId, pt.puzzleId, pt.orderInBlock, pt.timeMs, pt.errors || 0)
      }
    }
    return db.prepare(`
      SELECT a.id, u.nickname, a.block_id as blockId, b.name as blockName,
             a.attempt_number as attemptNumber, a.total_time_ms as totalTimeMs,
             a.solved, a.total_puzzles as totalPuzzles, a.errors, a.accuracy, a.ppm,
             a.created_at as createdAt
      FROM attempts a JOIN users u ON u.id = a.user_id LEFT JOIN blocks b ON b.id = a.block_id
      WHERE a.id = ?
    `).get(attemptId)
  })

  try { res.json(tx()) } catch (e) { console.error(e); res.status(500).json({ error: 'Error al guardar' }) }
})

// ─── LEADERBOARD ─────────────────────────────────────────────────────────────

// GET /api/leaderboard/:blockId — top por bloque (mejor tiempo, solo cycles completos)
router.get('/leaderboard/:blockId', (req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT u.nickname,
           MIN(a.total_time_ms) as bestTimeMs,
           MAX(a.ppm) as bestPpm,
           COUNT(a.id) as totalCycles,
           MIN(a.errors) as bestErrors
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    WHERE a.block_id = ? AND a.solved = a.total_puzzles
    GROUP BY a.user_id
    ORDER BY bestTimeMs ASC
    LIMIT 20
  `).all(req.params.blockId)
  res.json(rows)
})

module.exports = router
