const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const path = require('path')

const apiRouter = require('./routes/api')
const setupSockets = require('./socket/rooms')
const { getDb } = require('./db/database')

const app = express()
const server = http.createServer(app)

// Puerto 3002 (host del servidor)
const PORT = process.env.PORT || 3002

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // En producción se añade el dominio real via variable de entorno
  ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
]

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
})

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

getDb()

app.use('/api', apiRouter)
setupSockets(io)

// Sirve el build del cliente en producción
const clientDist = path.join(__dirname, '../../client/dist')
app.use(express.static(clientDist))
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

server.listen(PORT, () => {
  console.log(`\n🪃  Woodpecker server → http://localhost:${PORT}`)
  console.log(`   API: http://localhost:${PORT}/api/blocks`)
})
