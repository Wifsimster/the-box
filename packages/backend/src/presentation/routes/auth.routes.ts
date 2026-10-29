import { Router } from 'express'

const router = Router()

router.all('*', (_req, res) => {
  res.status(410).json({
    success: false,
    error: {
      code: 'DEPRECATED',
      message: 'This auth endpoint is deprecated. Please use /api/auth/* endpoints provided by better-auth.',
    },
  })
})

export default router
