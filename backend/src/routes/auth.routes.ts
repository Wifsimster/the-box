import { Router } from 'express'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { db } from '../config/database.js'
import { env } from '../config/env.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

// Register
router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body)

    // Check if user exists
    const existing = await db('users')
      .where('username', data.username)
      .orWhere('email', data.email)
      .first()

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'USER_EXISTS', message: 'Username or email already exists' },
      })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12)

    // Create user
    const [user] = await db('users')
      .insert({
        username: data.username,
        email: data.email,
        password_hash: passwordHash,
        display_name: data.username,
        is_guest: false,
      })
      .returning('*')

    // Generate token
    const token = jwt.sign(
      { userId: user.id, isGuest: false },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    )

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
          isGuest: user.is_guest,
          isAdmin: user.is_admin,
        },
        token,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message },
      })
    }
    throw error
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body)

    // Find user
    const user = await db('users')
      .where('email', data.email)
      .first()

    if (!user || user.is_guest) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      })
    }

    // Check password
    const validPassword = await bcrypt.compare(data.password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      })
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, isGuest: false },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
    )

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
          isGuest: user.is_guest,
          isAdmin: user.is_admin,
          totalScore: user.total_score,
          currentStreak: user.current_streak,
        },
        token,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message },
      })
    }
    throw error
  }
})

// Guest login
router.post('/guest', async (_req, res) => {
  try {
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Create guest user
    const [user] = await db('users')
      .insert({
        username: guestId,
        email: `${guestId}@guest.local`,
        password_hash: '',
        display_name: `Player ${guestId.slice(-4).toUpperCase()}`,
        is_guest: true,
      })
      .returning('*')

    // Generate token
    const token = jwt.sign(
      { userId: user.id, isGuest: true },
      env.JWT_SECRET,
      { expiresIn: '30d' } // Longer expiry for guests
    )

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          isGuest: true,
          isAdmin: false,
        },
        token,
      },
    })
  } catch (error) {
    throw error
  }
})

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db('users')
      .where('id', req.userId!)
      .first()

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          isGuest: user.is_guest,
          isAdmin: user.is_admin,
          totalScore: user.total_score,
          currentStreak: user.current_streak,
          longestStreak: user.longest_streak,
        },
      },
    })
  } catch (error) {
    throw error
  }
})

export default router
