import bcrypt from 'bcryptjs'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  findByEpic,
  findUserByUsername,
} from '../services/jsonStore.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a minute.' },
})

function normalizeDob(value) {
  const v = String(value || '').trim().replace(/[/.]/g, '-')
  let m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m) return `${m[3].padStart(4, '0')}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return v.toLowerCase().replace(/\s+/g, '')
}

async function passwordMatches(stored, input) {
  if (!stored) return false
  const hash = String(stored)
  if (hash.startsWith('$2y$') || hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$argon')) {
    // bcryptjs expects $2a$ / $2b$; PHP often uses $2y$
    const normalized = hash.replace(/^\$2y\$/, '$2a$')
    return bcrypt.compare(String(input), normalized)
  }
  return hash === String(input)
}

async function attemptLogin(identifier, secret) {
  const user = findUserByUsername(identifier)
  if (user?.password && (await passwordMatches(user.password, secret))) {
    return {
      id: String(user.id || ''),
      username: String(user.username || ''),
      name: String(user.name || user.username || 'Admin'),
      role: String(user.role || 'user'),
      type: 'user',
      voter_id: null,
      epic_no: null,
    }
  }

  const voter = findByEpic(identifier)
  if (!voter) return null

  let ok = false
  if (voter.password) {
    ok = await passwordMatches(voter.password, secret)
  }
  if (!ok && voter.dob) {
    ok = normalizeDob(voter.dob) === normalizeDob(secret)
  }
  if (!ok) return null

  return {
    id: String(voter.id),
    username: String(voter.epic_no),
    name: String(voter.name_en || voter.name_hi || voter.epic_no),
    role: 'voter',
    type: 'voter',
    voter_id: String(voter.id),
    epic_no: String(voter.epic_no),
  }
}

router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ authenticated: false })
  }
  return res.json({
    authenticated: true,
    user: req.session.user,
    lastLogin: req.session.lastLogin || null,
  })
})

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const voterId = String(req.body?.voter_id || '').trim()
    const password = String(req.body?.password || '')

    if (!voterId || !password) {
      return res.status(422).json({ message: 'Username and password are required.' })
    }

    const authUser = await attemptLogin(voterId, password)
    if (!authUser) {
      return res.status(401).json({ message: 'Invalid username or password.' })
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ message: 'Unable to create session.' })
      }
      req.session.user = authUser
      req.session.lastLogin = new Date().toISOString()
      return res.json({ success: true, user: authUser, lastLogin: req.session.lastLogin })
    })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Login failed.' })
  }
})

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('voter.sid')
    res.json({ success: true })
  })
})

export default router
