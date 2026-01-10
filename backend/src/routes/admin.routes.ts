import { Router } from 'express'
import { db } from '../config/database.js'
import { games, screenshots, dailyChallenges, tiers, tierScreenshots } from '../models/schema.js'
import { adminMiddleware } from '../middleware/auth.js'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'

const router = Router()

// All admin routes require authentication
router.use(adminMiddleware)

// === Games ===

// List all games
router.get('/games', async (_req, res) => {
  try {
    const allGames = await db.query.games.findMany({
      orderBy: [desc(games.createdAt)],
    })

    res.json({
      success: true,
      data: { games: allGames },
    })
  } catch (error) {
    throw error
  }
})

// Add a game
const createGameSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  releaseYear: z.number().optional(),
  developer: z.string().optional(),
  publisher: z.string().optional(),
  genres: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
  coverImageUrl: z.string().url().optional(),
})

router.post('/games', async (req, res) => {
  try {
    const data = createGameSchema.parse(req.body)

    const [game] = await db.insert(games)
      .values(data)
      .returning()

    res.status(201).json({
      success: true,
      data: { game },
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

// Update a game
router.put('/games/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const data = createGameSchema.partial().parse(req.body)

    const [game] = await db.update(games)
      .set(data)
      .where(eq(games.id, id))
      .returning()

    if (!game) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' },
      })
    }

    res.json({
      success: true,
      data: { game },
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

// Delete a game
router.delete('/games/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)

    await db.delete(games).where(eq(games.id, id))

    res.json({
      success: true,
      data: { deleted: true },
    })
  } catch (error) {
    throw error
  }
})

// === Screenshots ===

// List all screenshots
router.get('/screenshots', async (_req, res) => {
  try {
    const allScreenshots = await db.query.screenshots.findMany({
      with: {
        game: true,
      },
      orderBy: [desc(screenshots.createdAt)],
    })

    res.json({
      success: true,
      data: { screenshots: allScreenshots },
    })
  } catch (error) {
    throw error
  }
})

// Add a screenshot
const createScreenshotSchema = z.object({
  gameId: z.number(),
  imageUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  difficulty: z.number().min(1).max(3).default(2),
  haov: z.number().default(180),
  vaov: z.number().default(90),
  locationHint: z.string().optional(),
})

router.post('/screenshots', async (req, res) => {
  try {
    const data = createScreenshotSchema.parse(req.body)

    const [screenshot] = await db.insert(screenshots)
      .values(data)
      .returning()

    res.status(201).json({
      success: true,
      data: { screenshot },
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

// === Challenges ===

// List all challenges
router.get('/challenges', async (_req, res) => {
  try {
    const allChallenges = await db.query.dailyChallenges.findMany({
      with: {
        tiers: true,
      },
      orderBy: [desc(dailyChallenges.challengeDate)],
    })

    res.json({
      success: true,
      data: { challenges: allChallenges },
    })
  } catch (error) {
    throw error
  }
})

// Create a challenge
const createChallengeSchema = z.object({
  challengeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tiers: z.array(z.object({
    tierNumber: z.number(),
    name: z.string(),
    timeLimitSeconds: z.number().default(30),
    screenshotIds: z.array(z.number()).length(18),
  })),
})

router.post('/challenges', async (req, res) => {
  try {
    const data = createChallengeSchema.parse(req.body)

    // Create challenge
    const [challenge] = await db.insert(dailyChallenges)
      .values({
        challengeDate: data.challengeDate,
      })
      .returning()

    // Create tiers
    for (const tierData of data.tiers) {
      const [tier] = await db.insert(tiers)
        .values({
          dailyChallengeId: challenge!.id,
          tierNumber: tierData.tierNumber,
          name: tierData.name,
          timeLimitSeconds: tierData.timeLimitSeconds,
        })
        .returning()

      // Create tier screenshots
      for (let i = 0; i < tierData.screenshotIds.length; i++) {
        await db.insert(tierScreenshots).values({
          tierId: tier!.id,
          screenshotId: tierData.screenshotIds[i]!,
          position: i + 1,
        })
      }
    }

    res.status(201).json({
      success: true,
      data: {
        challengeId: challenge!.id,
        date: challenge!.challengeDate,
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

export default router
