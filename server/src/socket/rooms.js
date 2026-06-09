const { getDb } = require('../db/database')

const rooms = new Map()

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// [CAMBIADO] Obtener puzzles por array de IDs
function getPuzzlesByIds(ids) {
  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT p.id, p.block_id as blockId, b.name as blockName,
           p.order_in_block as orderInBlock, p.fen, p.solution
    FROM puzzles p
    JOIN blocks b ON b.id = p.block_id
    WHERE p.id IN (${placeholders})
  `).all(...ids)
  // Mantener el orden solicitado
  const byId = Object.fromEntries(rows.map(r => [r.id, { ...r, solution: JSON.parse(r.solution) }]))
  return ids.map(id => byId[id]).filter(Boolean)
}

function saveRaceAttempt(data) {
  const db = getDb()
  const { nickname, blockId, totalTimeMs, solved, totalPuzzles, errors, puzzleTimes } = data
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
  })
  tx()
}

function broadcastProgress(io, code) {
  const room = rooms.get(code)
  if (!room) return
  io.to(code).emit('progress_update', room.players.map(p => ({
    nickname: p.nickname,
    solved: p.solved,
    totalPuzzles: room.totalPuzzles,
    finished: p.finished,
  })))
}

function checkRaceEnd(io, code) {
  const room = rooms.get(code)
  if (!room || room.status !== 'racing') return
  if (room.players.every(p => p.finished)) { endRace(io, code); return }
  if (room.timeLimit && Date.now() - room.startedAt > room.timeLimit * 1000) endRace(io, code)
}

function endRace(io, code) {
  const room = rooms.get(code)
  if (!room || room.status === 'finished') return
  room.status = 'finished'
  const results = room.players
    .map(p => ({
      nickname: p.nickname,
      solved: p.solved,
      totalPuzzles: room.totalPuzzles,
      totalTimeMs: p.finishedAt ? p.finishedAt - room.startedAt : Date.now() - room.startedAt,
      errors: p.errors,
      accuracy: p.solved > 0 ? Math.round((p.solved / (p.solved + p.errors)) * 100) : 0,
    }))
    .sort((a, b) => b.solved !== a.solved ? b.solved - a.solved : a.totalTimeMs - b.totalTimeMs)
    .map((r, i) => ({ ...r, position: i + 1 }))
  io.to(code).emit('race_finished', results)
  setTimeout(() => rooms.delete(code), 5 * 60 * 1000)
}

module.exports = function setupSockets(io) {
  io.on('connection', socket => {
    console.log(`+ ${socket.id} connected`)

    // [CAMBIADO] create_room recibe puzzleIds en lugar de blockId
    socket.on('create_room', ({ nickname, puzzleIds, timeLimit }) => {
      if (!Array.isArray(puzzleIds) || puzzleIds.length === 0) {
        socket.emit('error', 'puzzleIds inválidos')
        return
      }
      let code = generateCode()
      while (rooms.has(code)) code = generateCode()

      const room = {
        code,
        hostId: socket.id,
        puzzleIds,          // guardamos los IDs en orden
        totalPuzzles: puzzleIds.length,
        timeLimit,
        players: [{ id: socket.id, nickname, solved: 0, errors: 0, finished: false }],
        status: 'waiting',
        startedAt: null,
      }
      rooms.set(code, room)
      socket.join(code)
      socket.emit('room_created', { code })
      socket.emit('room_state', {
        code: room.code,
        hostId: room.hostId,
        puzzleIds: room.puzzleIds,
        totalPuzzles: room.totalPuzzles,
        timeLimit: room.timeLimit,
        players: room.players,
        status: room.status,
      })
      console.log(`Room ${code} created (${puzzleIds.length} puzzles) by ${nickname}`)
    })

    socket.on('join_room', ({ code, nickname }) => {
        const room = rooms.get(code)
        if (!room) { socket.emit('join_error', 'Sala "${code}" no encontrada'); return }
        if (room.status === 'racing') { socket.emit('join_error', 'La carrera ya comenzó'); return }

        const alreadyIn = room.players.find(p => p.id === socket.id)
        if (!alreadyIn) {
            const player = { id: socket.id, nickname, solved: 0, errors: 0, finished: false }
            room.players.push(player)
            socket.to(code).emit('player_joined', player)
        }
        socket.join(code)
        socket.emit('room_state', {
            code: room.code,
            hostId: room.hostId,
            puzzleIds: room.puzzleIds,
            totalPuzzles: room.totalPuzzles,
            timeLimit: room.timeLimit,
            players: room.players,
            status: room.status,
        })
        console.log(${nickname} joined ${code})
    })

    socket.on('start_race', ({ code }) => {
      const room = rooms.get(code)
      if (!room || room.hostId !== socket.id || room.status !== 'waiting') return

      room.status = 'racing'
      room.startedAt = Date.now()
      io.to(code).emit('race_starting')

      // [CAMBIADO] Envía puzzleIds en lugar de blockId
      setTimeout(() => {
        io.to(code).emit('race_data', {
          puzzleIds: room.puzzleIds,
          totalPuzzles: room.totalPuzzles,
        })
      }, 1500)

      if (room.timeLimit) {
        setTimeout(() => endRace(io, code), room.timeLimit * 1000 + 2000)
      }
    })

    socket.on('puzzle_solved', ({ solved, errors }) => {
      const roomEntry = [...rooms.entries()].find(([, r]) => r.players.some(p => p.id === socket.id))
      if (!roomEntry) return
      const [code, room] = roomEntry
      if (room.status !== 'racing') return
      const player = room.players.find(p => p.id === socket.id)
      if (!player) return
      player.solved = solved
      player.errors += errors
      if (solved >= room.totalPuzzles) {
        player.finished = true
        player.finishedAt = Date.now()
      }
      broadcastProgress(io, code)
      checkRaceEnd(io, code)
    })

    socket.on('race_complete', data => {
      try { saveRaceAttempt(data) } catch (e) { console.error('save error:', e) }
    })

    socket.on('disconnect', () => {
      console.log(`- ${socket.id} disconnected`)
      rooms.forEach((room, code) => {
        const idx = room.players.findIndex(p => p.id === socket.id)
        if (idx === -1) return
        room.players.splice(idx, 1)
        socket.to(code).emit('player_left', socket.id)
        if (room.hostId === socket.id && room.players.length > 0) room.hostId = room.players[0].id
        if (room.players.length === 0) rooms.delete(code)
        if (room.status === 'racing') checkRaceEnd(io, code)
      })
    })
  })
}
