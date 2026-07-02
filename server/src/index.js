const express = require('express')
const cors = require('cors')
const apiRouter = require('./routes/api')
const { initDb } = require('./db/database')

const app = express()
const PORT = process.env.PORT || 3002

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
]

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())
app.use('/api', apiRouter)

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🪃  Woodpecker → http://localhost:${PORT}`)
})

initDb()
  .then(() => console.log('✓ DB ready'))
  .catch(err => console.error('Failed to init DB:', err))
