const express = require('express')
const router = express.Router()
const { getDb } = require('../db/database')

// GET /api/blocks
router.get('/blocks', (req, res) => {
  const db = getDb()
  const blocks = db.prepare(`
    SELECT b.id, b.name, b.description, COUNT(p.id) as puzzleCount
    FROM blocks b
    LEFT JOIN puzzles p ON p.block_id = b.id
    GROUP BY b.id
    ORDER BY b.id
  `).all()
  res.json(blocks)
})

// GET /api/puzzles  — [NUEVO] todos los puzzles con blockName
router.get('/puzzles', (req, res) => {
  const db = getDb()
  const puzzles = db.prepare(`
    SELECT p.id, p.block_id as blockId, b.name as blockName,
           p.order_in_block as orderInBlock, p.fen, p.solution
    FROM puzzles p
    JOIN blocks b ON b.id = p.block_id
    ORDER BY p.block_id, p.order_in_block
  `).all()
  res.json(puzzles.map(p => ({ ...p, solution: JSON.parse(p.solution) })))
})

// POST /api/puzzles/by-ids  — [NUEVO] puzzles por array de IDs
router.post('/puzzles/by-ids', (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' })
  }
  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  const puzzles = db.prepare(`
    SELECT p.id, p.block_id as blockId, b.name as blockName,
           p.order_in_block as orderInBlock, p.fen, p.solution
    FROM puzzles p
    JOIN blocks b ON b.id = p.block_id
    WHERE p.id IN (${placeholders})
  `).all(...ids)

  // Devolver en el mismo orden que se pidió
  const byId = Object.fromEntries(puzzles.map(p => [p.id, { ...p, solution: JSON.parse(p.solution) }]))
  res.json(ids.map(id => byId[id]).filter(Boolean))
})

// GET /api/blocks/:id/puzzles
router.get('/blocks/:id/puzzles', (req, res) => {
  const db = getDb()
  const puzzles = db.prepare(`
    SELECT p.id, p.block_id as blockId, b.name as blockName,
           p.order_in_block as orderInBlock, p.fen, p.solution
    FROM puzzles p
    JOIN blocks b ON b.id = p.block_id
    WHERE p.block_id = ?
    ORDER BY p.order_in_block
  `).all(req.params.id)
  res.json(puzzles.map(p => ({ ...p, solution: JSON.parse(p.solution) })))
})

// GET /api/attempts
router.get('/attempts', (req, res) => {
  const db = getDb()
  const { nickname, blockId } = req.query
  if (!nickname) return res.status(400).json({ error: 'nickname required' })

  let query = `
    SELECT a.id, a.nickname, a.block_id as blockId,
           COALESCE(b.name, 'Custom') as blockName,
           a.attempt_number as attemptNumber, a.total_time_ms as totalTimeMs,
           a.solved, a.total_puzzles as totalPuzzles, a.errors, a.accuracy,
           a.created_at as createdAt
    FROM attempts a
    LEFT JOIN blocks b ON b.id = a.block_id
    WHERE a.nickname = ?
  `
  const params = [nickname]
  if (blockId) { query += ' AND a.block_id = ?'; params.push(blockId) }
  query += ' ORDER BY a.created_at DESC'

  res.json(db.prepare(query).all(...params))
})

// POST /api/attempts
router.post('/attempts', (req, res) => {
  const db = getDb()
  const { nickname, blockId, totalTimeMs, solved, totalPuzzles, errors, puzzleTimes } = req.body
  if (!nickname) return res.status(400).json({ error: 'nickname required' })

  const accuracy = solved > 0 ? Math.round((solved / (solved + (errors || 0))) * 100) : 0

  const prev = db.prepare(
    'SELECT MAX(attempt_number) as maxAttempt FROM attempts WHERE nickname = ? AND (block_id = ? OR (block_id IS NULL AND ? IS NULL))'
  ).get(nickname, blockId ?? null, blockId ?? null)
  const attemptNumber = (prev.maxAttempt || 0) + 1

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO attempts (nickname, block_id, attempt_number, total_time_ms, solved, total_puzzles, errors, accuracy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nickname, blockId ?? null, attemptNumber, totalTimeMs, solved, totalPuzzles, errors || 0, accuracy)

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
      SELECT a.id, a.nickname, a.block_id as blockId,
             COALESCE(b.name,'Custom') as blockName,
             a.attempt_number as attemptNumber, a.total_time_ms as totalTimeMs,
             a.solved, a.total_puzzles as totalPuzzles, a.errors, a.accuracy,
             a.created_at as createdAt
      FROM attempts a LEFT JOIN blocks b ON b.id = a.block_id
      WHERE a.id = ?
    `).get(attemptId)
  })

  try {
    res.json(tx())
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to save attempt' })
  }
})

module.exports = router
