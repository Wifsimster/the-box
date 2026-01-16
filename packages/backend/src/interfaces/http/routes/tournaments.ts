import { Router } from 'express'
import type { Request, Response } from 'express'
import { db } from '../../../infrastructure/database/connection.js'
import { TournamentService } from '../../../domain/tournament/service.js'
import { authMiddleware } from '../../../presentation/middleware/auth.middleware.js'
import { z } from 'zod'

const router = Router()
const tournamentService = new TournamentService(db)

// Validation schemas
const createTournamentSchema = z.object({
    name: z.string().min(1).max(255),
    type: z.enum(['weekly', 'monthly']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    prizeDescription: z.string().optional(),
    maxParticipants: z.number().int().positive().optional(),
})

const updateTournamentSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    isActive: z.boolean().optional(),
    prizeDescription: z.string().optional(),
    maxParticipants: z.number().int().positive().optional(),
})

// Get all tournaments (with optional filters)
router.get('/', async (req: Request, res: Response) => {
    try {
        const type = req.query.type as 'weekly' | 'monthly' | undefined
        const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined

        const filters: any = {}
        if (type) filters.type = type
        if (isActive !== undefined) filters.isActive = isActive

        const tournaments = await tournamentService.listTournaments(filters)
        res.json({
            success: true,
            data: { tournaments }
        })
    } catch (error) {
        console.error('Error fetching tournaments:', error)
        res.status(500).json({
            success: false,
            error: { code: 'FETCH_ERROR', message: 'Failed to fetch tournaments' }
        })
    }
})

// Get active tournaments
router.get('/active', async (_req: Request, res: Response) => {
    try {
        const tournaments = await tournamentService.getActiveTournaments()
        res.json({
            success: true,
            data: { tournaments }
        })
    } catch (error) {
        console.error('Error fetching active tournaments:', error)
        res.status(500).json({
            success: false,
            error: { code: 'FETCH_ERROR', message: 'Failed to fetch active tournaments' }
        })
    }
})

// Get upcoming tournaments
router.get('/upcoming', async (_req: Request, res: Response) => {
    try {
        const tournaments = await tournamentService.getUpcomingTournaments()
        res.json({
            success: true,
            data: { tournaments }
        })
    } catch (error) {
        console.error('Error fetching upcoming tournaments:', error)
        res.status(500).json({
            success: false,
            error: { code: 'FETCH_ERROR', message: 'Failed to fetch upcoming tournaments' }
        })
    }
})

// Get specific tournament
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const tournament = await tournamentService.getTournament(id)
        if (!tournament) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tournament not found' }
            })
        }

        res.json({
            success: true,
            data: { tournament }
        })
    } catch (error) {
        console.error('Error fetching tournament:', error)
        res.status(500).json({
            success: false,
            error: { code: 'FETCH_ERROR', message: 'Failed to fetch tournament' }
        })
    }
})

// Get tournament leaderboard
router.get('/:id/leaderboard', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500)
        const offset = parseInt(req.query.offset as string, 10) || 0

        const leaderboard = await tournamentService.getTournamentLeaderboard(id, limit, offset)
        res.json({
            success: true,
            data: { leaderboard }
        })
    } catch (error) {
        console.error('Error fetching tournament leaderboard:', error)
        res.status(500).json({
            success: false,
            error: { code: 'FETCH_ERROR', message: 'Failed to fetch tournament leaderboard' }
        })
    }
})

// Get tournament stats
router.get('/:id/stats', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const stats = await tournamentService.getTournamentStats(id)
        res.json({
            success: true,
            data: { stats }
        })
    } catch (error) {
        console.error('Error fetching tournament stats:', error)
        res.status(500).json({
            success: false,
            error: { code: 'FETCH_ERROR', message: 'Failed to fetch tournament stats' }
        })
    }
})

// Get user's rank in tournament (requires auth)
router.get('/:id/my-rank', authMiddleware, async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const userId = req.user!.id
        const rank = await tournamentService.getUserRank(id, userId)

        res.json({
            success: true,
            data: { rank }
        })
    } catch (error) {
        console.error('Error fetching user rank:', error)
        res.status(500).json({
            success: false,
            error: { code: 'FETCH_ERROR', message: 'Failed to fetch user rank' }
        })
    }
})

// Join tournament (requires auth)
router.post('/:id/join', authMiddleware, async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const userId = req.user!.id
        const participant = await tournamentService.joinTournament(id, userId)

        res.status(201).json({
            success: true,
            data: { participant }
        })
    } catch (error: any) {
        console.error('Error joining tournament:', error)
        res.status(400).json({
            success: false,
            error: { code: 'JOIN_ERROR', message: error.message || 'Failed to join tournament' }
        })
    }
})

// Leave tournament (requires auth)
router.delete('/:id/leave', authMiddleware, async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const userId = req.user!.id
        const result = await tournamentService.leaveTournament(id, userId)

        if (!result) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Participation not found' }
            })
        }

        res.json({
            success: true,
            data: { left: true }
        })
    } catch (error) {
        console.error('Error leaving tournament:', error)
        res.status(500).json({
            success: false,
            error: { code: 'LEAVE_ERROR', message: 'Failed to leave tournament' }
        })
    }
})

// Check if user is participating (requires auth)
router.get('/:id/is-participating', authMiddleware, async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const userId = req.user!.id
        const isParticipating = await tournamentService.isUserParticipating(id, userId)

        res.json({
            success: true,
            data: { isParticipating }
        })
    } catch (error) {
        console.error('Error checking participation:', error)
        res.status(500).json({
            success: false,
            error: { code: 'CHECK_ERROR', message: 'Failed to check participation' }
        })
    }
})

// Admin: Create tournament (requires auth + admin role)
router.post('/', authMiddleware, async (req: Request, res: Response) => {
    try {
        // Check admin role
        if (req.user!.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Forbidden: Admin access required' }
            })
        }

        const validation = createTournamentSchema.safeParse(req.body)
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: validation.error }
            })
        }

        const tournament = await tournamentService.createTournament(validation.data)
        res.status(201).json({
            success: true,
            data: { tournament }
        })
    } catch (error: any) {
        console.error('Error creating tournament:', error)
        res.status(400).json({
            success: false,
            error: { code: 'CREATE_ERROR', message: error.message || 'Failed to create tournament' }
        })
    }
})

// Admin: Update tournament (requires auth + admin role)
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
        // Check admin role
        if (req.user!.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Forbidden: Admin access required' }
            })
        }

        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const validation = updateTournamentSchema.safeParse(req.body)
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: validation.error }
            })
        }

        const tournament = await tournamentService.updateTournament(id, validation.data)
        if (!tournament) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tournament not found' }
            })
        }

        res.json({
            success: true,
            data: { tournament }
        })
    } catch (error: any) {
        console.error('Error updating tournament:', error)
        res.status(400).json({
            success: false,
            error: { code: 'UPDATE_ERROR', message: error.message || 'Failed to update tournament' }
        })
    }
})

// Admin: Delete tournament (requires auth + admin role)
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
        // Check admin role
        if (req.user!.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Forbidden: Admin access required' }
            })
        }

        const id = parseInt(req.params.id as string, 10)
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_ID', message: 'Invalid tournament ID' }
            })
        }

        const result = await tournamentService.deleteTournament(id)
        if (!result) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tournament not found' }
            })
        }

        res.json({
            success: true,
            data: { deleted: true }
        })
    } catch (error) {
        console.error('Error deleting tournament:', error)
        res.status(500).json({
            success: false,
            error: { code: 'DELETE_ERROR', message: 'Failed to delete tournament' }
        })
    }
})

export { router as tournamentRouter }
