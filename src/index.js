import express from 'express'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import voterRoutes from './routes/voters.js'
import profileRoutes from './routes/profile.js'
import customerRoutes from './routes/customers.js'

const app = express()
const PORT = process.env.PORT || 4000
const isProd = process.env.NODE_ENV === 'production'
// Frontend URL for CORS (e.g. https://your-app.vercel.app). Reflect request origin in local/dev.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || true
const crossSiteCookies = Boolean(process.env.CLIENT_ORIGIN)

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
      // Separate client/server hosts need SameSite=None + Secure
      sameSite: isProd && crossSiteCookies ? 'none' : 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 2,
    },
  }),
)

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'voter-api' })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes)
app.use('/api', voterRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/customers', customerRoutes)

app.use((req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.path}` })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: err.message || 'Server error' })
})

app.listen(PORT, () => {
  console.log(`API running on http://127.0.0.1:${PORT}`)
})
