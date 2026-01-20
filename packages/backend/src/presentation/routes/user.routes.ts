import { Router } from 'express'
import { userService } from '../../domain/services/index.js'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { userRepository } from '../../infrastructure/repositories/user.repository.js'
import { avatarUpload, getAvatarUrl, deleteAvatarFile } from '../middleware/upload.middleware.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

// Get current user's profile with stats
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.userId!)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      })
    }

    res.json({
      success: true,
      data: user,
    })
  } catch (error) {
    next(error)
  }
})

// Get user's daily game history
router.get('/history', authMiddleware, async (req, res, next) => {
  try {
    const data = await userService.getGameHistory(req.userId!)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

// Get detailed game session information
router.get('/history/:sessionId', authMiddleware, async (req, res, next) => {
  try {
    const { sessionId } = req.params
    if (!sessionId || Array.isArray(sessionId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SESSION_ID', message: 'Invalid session ID' },
      })
    }
    const data = await userService.getGameSessionDetails(sessionId, req.userId!)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
})

// Upload avatar
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      })
    }

    // Get current user to check for existing avatar
    const currentUser = await userRepository.findById(req.userId!)
    const oldAvatarUrl = currentUser?.avatarUrl

    // Update user with new avatar URL
    const avatarUrl = getAvatarUrl(req.file.filename)
    const updatedUser = await userRepository.updateAvatarUrl(req.userId!, avatarUrl)

    // Delete old avatar file if it exists and is a local upload
    if (oldAvatarUrl) {
      await deleteAvatarFile(oldAvatarUrl)
    }

    logger.info({ userId: req.userId, avatarUrl }, 'avatar uploaded')

    res.json({
      success: true,
      data: updatedUser,
    })
  } catch (error) {
    next(error)
  }
})

// Delete avatar
router.delete('/avatar', authMiddleware, async (req, res, next) => {
  try {
    // Get current user to check for existing avatar
    const currentUser = await userRepository.findById(req.userId!)
    const oldAvatarUrl = currentUser?.avatarUrl

    // Remove avatar URL from user
    const updatedUser = await userRepository.updateAvatarUrl(req.userId!, null)

    // Delete old avatar file if it exists
    if (oldAvatarUrl) {
      await deleteAvatarFile(oldAvatarUrl)
    }

    logger.info({ userId: req.userId }, 'avatar deleted')

    res.json({
      success: true,
      data: updatedUser,
    })
  } catch (error) {
    next(error)
  }
})

export default router
