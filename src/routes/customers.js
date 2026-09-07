import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  resetCustomerPassword,
} from '../services/jsonStore.js'

const router = Router()

router.get('/', requireAuth, requireAdmin, (_req, res) => {
  try {
    res.json({ customers: listCustomers() })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim()
    const name = String(req.body?.name || '').trim()
    const password = String(req.body?.password || '')

    if (password.length < 6) {
      return res.status(422).json({ message: 'Password must be at least 6 characters.' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const customer = createCustomer({ username, name, password: hashed })

    res.status(201).json({
      success: true,
      message: 'Customer created successfully.',
      customer,
    })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to create customer.' })
  }
})

router.post('/:id/password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const password = String(req.body?.password || '')
    if (password.length < 6) {
      return res.status(422).json({ message: 'Password must be at least 6 characters.' })
    }
    const hashed = await bcrypt.hash(password, 10)
    const ok = resetCustomerPassword(req.params.id, hashed)
    if (!ok) return res.status(404).json({ message: 'Customer not found.' })
    return res.json({ success: true, message: 'Customer password updated.' })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to update password.' })
  }
})

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const ok = deleteCustomer(req.params.id)
    if (!ok) return res.status(404).json({ message: 'Customer not found.' })
    return res.json({ success: true, message: 'Customer deleted.' })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to delete customer.' })
  }
})

export default router
