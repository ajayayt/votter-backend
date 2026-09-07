import { Router } from 'express'
import multer from 'multer'
import {
  findById,
  importVotersFromJsonString,
  paginate,
  publicVoter,
  searchVoters,
  voterStats,
} from '../services/jsonStore.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

router.get('/dashboard', requireAuth, (req, res) => {
  try {
    const stats = voterStats()
    res.json({
      stats,
      lastLogin: req.session.lastLogin || null,
      user: req.session.user,
    })
  } catch (error) {
    res.status(500).json({
      stats: { total: 0, male: 0, female: 0, other: 0 },
      message: error.message,
      lastLogin: req.session.lastLogin || null,
      user: req.session.user,
    })
  }
})

router.get('/voters/search', requireAuth, (req, res) => {
  try {
    let search = String(req.query.search || '').trim()
    search = search.replace(/[\u0000-\u001F\u007F]/g, '')

    const results = searchVoters(search)
    const page = Number(req.query.page || 1)
    const perPage = Number(req.query.per_page || 20)
    const paginated = paginate(results, page, perPage)
    paginated.data = paginated.data.map(publicVoter)

    let message = null
    if (search && paginated.total === 0) {
      message = `No voters found for "${search}".`
    } else if (!search && paginated.total === 0) {
      message = 'No voter records available.'
    }

    res.json({ success: true, message, search, ...paginated })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      total: 0,
    })
  }
})

router.get('/voters/:id', requireAuth, (req, res) => {
  try {
    const voter = findById(req.params.id)
    if (!voter) {
      return res.status(404).json({ message: 'Voter not found.' })
    }
    return res.json({ voter: publicVoter(voter) })
  } catch (error) {
    return res.status(500).json({ message: error.message })
  }
})

router.post('/import', requireAuth, requireAdmin, upload.single('voters_json'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ message: 'Please choose a JSON file to import.' })
    }

    const name = String(req.file.originalname || '').toLowerCase()
    if (!name.endsWith('.json') && !name.endsWith('.txt')) {
      return res.status(422).json({ message: 'Only JSON files are allowed.' })
    }

    // Keep session alive during long imports
    if (req.session) req.session.touch()

    const contents = req.file.buffer.toString('utf8')
    const result = importVotersFromJsonString(contents)

    return res.json({
      success: true,
      message: result.message,
      added: result.added,
      skipped: result.skipped,
      total: result.total,
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Import failed.' })
  }
})

export default router
