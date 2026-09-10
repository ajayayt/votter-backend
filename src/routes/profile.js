import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  findVoter,
  findUserById,
  publicVoter,
  updateUserPassword,
} from '../services/jsonStore.js'

const router = Router()

router.get('/', requireAuth, (req, res) => {
  const auth = req.session.user
  const profile = {
    name: auth.name || '',
    voter_id: auth.epic_no || auth.username || '',
    gender: '',
    age: '',
    house_no: '',
    role: auth.role || '',
    type: auth.type || '',
    can_change_password: auth.type === 'user',
  }

  if (auth.type === 'voter' && auth.voter_id) {
    const voter = findVoter(auth.voter_id)
    if (voter) {
      const safe = publicVoter(voter)
      profile.name = safe.name_en || safe.name_hi
      profile.name_hi = safe.name_hi || ''
      profile.voter_id = safe.epic_no
      profile.gender = safe.gender || ''
      profile.age = safe.age ?? ''
      profile.house_no = safe.house_no || ''
      profile.polling_station = safe.polling_station || ''
    }
  }

  res.json({ profile })
})

router.post('/password', requireAuth, async (req, res) => {
  const auth = req.session.user
  if (auth.type !== 'user') {
    return res.status(403).json({ message: 'Password change is only available for staff accounts.' })
  }

  const currentPassword = String(req.body?.current_password || '')
  const password = String(req.body?.password || '')
  const confirmation = String(req.body?.password_confirmation || '')

  if (!currentPassword || !password) {
    return res.status(422).json({ message: 'Current and new password are required.' })
  }
  if (password.length < 6) {
    return res.status(422).json({ message: 'New password must be at least 6 characters.' })
  }
  if (password !== confirmation) {
    return res.status(422).json({ message: 'Password confirmation does not match.' })
  }

  const user = findUserById(auth.id)
  if (!user?.password) {
    return res.status(400).json({ message: 'User not found.' })
  }

  const hash = String(user.password).replace(/^\$2y\$/, '$2a$')
  const ok = await bcrypt.compare(currentPassword, hash)
  if (!ok) {
    return res.status(401).json({ message: 'Current password is incorrect.' })
  }

  const newHash = await bcrypt.hash(password, 10)
  updateUserPassword(auth.id, newHash)
  return res.json({ success: true, message: 'Password updated successfully.' })
})

export default router
