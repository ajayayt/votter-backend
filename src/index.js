import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import voterRoutes from './routes/voters.js'
import profileRoutes from './routes/profile.js'
import customerRoutes from './routes/customers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4000
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || true
const isProd = process.env.NODE_ENV === 'production'

app.set('trust proxy', 1)
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(
  session({
    name: 'voter.sid',
    secret: process.env.SESSION_SECRET || 'voter-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 2,
    },
  }),
)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes)
app.use('/api', voterRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/customers', customerRoutes)

if (isProd) {
  const clientDist = path.resolve(__dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: err.message || 'Server error' })
})

app.listen(PORT, () => {
  console.log(`API running on http://127.0.0.1:${PORT}`)
})
