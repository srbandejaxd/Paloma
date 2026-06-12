const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'woodpecker-secret-change-in-prod'

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' })
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = { authMiddleware, JWT_SECRET }
