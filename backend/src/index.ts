import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { env, validateEnv } from './config/env.js'
import { testConnection } from './config/database.js'
import { initializeSocket } from './lib/socket.js'
import authRoutes from './routes/auth.routes.js'
import gameRoutes from './routes/game.routes.js'
import leaderboardRoutes from './routes/leaderboard.routes.js'
import adminRoutes from './routes/admin.routes.js'

// Validate environment
validateEnv()

const app = express()
const httpServer = createServer(app)

// Initialize Socket.io
export const io = initializeSocket(httpServer)

// Middleware
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/game', gameRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/admin', adminRoutes)

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    },
  })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  })
})

// Start server
async function start() {
  // Test database connection
  const dbConnected = await testConnection()
  if (!dbConnected) {
    console.warn('Warning: Database connection failed. Some features may not work.')
  }

  httpServer.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`)
    console.log(`Environment: ${env.NODE_ENV}`)
    console.log(`CORS origin: ${env.CORS_ORIGIN}`)
  })
}

start().catch(console.error)
