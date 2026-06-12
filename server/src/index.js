const express = require('express')
const cors = require('cors')
const path = require('path')
const apiRouter = require('./routes/api')
const { getDb } = require('./db/database')

const app = express()
const PORT = process.env.PORT || 3002

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.CLIENT_ORIGIN ? [process.env.CLIENT_ORIGIN] : []),
]

app.use(cors({ origin: allowedOrigins }))
app.use(express.json())

getDb()

app.use('/api', apiRouter)

app.listen(PORT, () => {
  console.log(`\n🪃  Woodpecker server → http://localhost:${PORT}`)
  console.log(`   API: http://localhost:${PORT}/api/blocks`)
})
