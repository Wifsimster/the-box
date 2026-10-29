import { queueLogger } from '../../logger/logger.js'
import { challengeRepository } from '../../repositories/challenge.repository.js'
import { sessionRepository } from '../../repositories/session.repository.js'
import { db } from '../../database/connection.js'

const log = queueLogger.child({ module: 'daily-challenge' })

const TOTAL_SCREENSHOTS = 10
const UNFOUND_PENALTY = 0

export type ProgressCallback = (current: number, total: number, message: string) => void

export interface DailyChallengeResult {
  created: boolean
  challengeId?: number
  challengeDate: string
  screenshotsAssigned: number
  message: string
}

function getTodayDateUTC(referenceMs?: number): string {
  const ref = typeof referenceMs === 'number' ? new Date(referenceMs) : new Date()
  return ref.toISOString().split('T')[0]!
}

interface ScreenshotPick {
  id: number
  difficulty: number
}

function orderByDifficultyAscending(picks: ScreenshotPick[]): number[] {
  return [...picks]
    .sort((a, b) => a.difficulty - b.difficulty || Math.random() - 0.5)
    .map((p) => p.id)
}

async function selectRandomScreenshots(count: number): Promise<number[]> {
  const result = await db('screenshots')
    .join('games', 'screenshots.game_id', 'games.id')
    .where('screenshots.is_active', true)
    .where('games.metacritic', '>=', 85)
    .count('screenshots.id as count')
    .first()
  const available = Number(result?.count ?? 0)

  if (available === 0) {
    throw new Error('No screenshots available from games with metascore >= 85')
  }

  log.info({ available, needed: count, minMetascore: 85 }, 'Selecting random screenshots')

  if (available >= count) {
    const rows = await db('screenshots')
      .join('games', 'screenshots.game_id', 'games.id')
      .where('screenshots.is_active', true)
      .where('games.metacritic', '>=', 85)
      .orderByRaw('RANDOM()')
      .limit(count)
      .select<Array<{ id: number; difficulty: number }>>(
        'screenshots.id',
        'screenshots.difficulty'
      )
    return orderByDifficultyAscending(rows)
  }

  log.warn(
    { available, needed: count, minMetascore: 85 },
    'Not enough unique screenshots with metascore >= 85, allowing reuse'
  )

  const all = await db('screenshots')
    .join('games', 'screenshots.game_id', 'games.id')
    .where('screenshots.is_active', true)
    .where('games.metacritic', '>=', 85)
    .select<Array<{ id: number; difficulty: number }>>(
      'screenshots.id',
      'screenshots.difficulty'
    )

  const selected: ScreenshotPick[] = []
  while (selected.length < count) {
    const shuffled = [...all].sort(() => Math.random() - 0.5)
    const needed = count - selected.length
    selected.push(...shuffled.slice(0, needed))
  }

  return orderByDifficultyAscending(selected.slice(0, count))
}

async function endAllInProgressGames(): Promise<{ ended: number; failed: number }> {
  log.info('Starting to end all in-progress games')

  let ended = 0
  let failed = 0

  try {
    const inProgressSessions = await sessionRepository.findAllInProgressSessions()
    log.info({ count: inProgressSessions.length }, 'Found in-progress game sessions')

    for (const session of inProgressSessions) {
      try {
        const correctPositions = await sessionRepository.getCorrectPositions(session.id)
        const screenshotsFound = correctPositions.length
        const unfoundCount = TOTAL_SCREENSHOTS - screenshotsFound

        const penaltyApplied = unfoundCount * UNFOUND_PENALTY

        const finalScore = session.total_score - penaltyApplied

        await sessionRepository.updateGameSession(session.id, {
          totalScore: finalScore,
          currentPosition: session.current_position,
          isCompleted: true,
        })

        log.info(
          {
            sessionId: session.id,
            userId: session.user_id,
            finalScore,
            screenshotsFound,
            unfoundCount,
            penaltyApplied,
            completionReason: 'midnight_auto_end',
          },
          'game ended automatically at midnight'
        )

        ended++
      } catch (error) {
        failed++
        log.error(
          { sessionId: session.id, userId: session.user_id, error: String(error) },
          'failed to end game session'
        )
      }
    }

    log.info({ ended, failed, total: inProgressSessions.length }, 'Finished ending in-progress games')
  } catch (error) {
    log.error({ error: String(error) }, 'failed to fetch in-progress sessions')
  }

  return { ended, failed }
}

export async function createDailyChallenge(
  onProgress?: ProgressCallback,
  options?: { referenceMs?: number; targetDate?: string }
): Promise<DailyChallengeResult> {
  const challengeDate = options?.targetDate ?? getTodayDateUTC(options?.referenceMs)

  log.info({ challengeDate }, 'Starting daily challenge creation')
  onProgress?.(0, 5, `Checking for existing challenge on ${challengeDate}...`)

  const existingChallenge = await challengeRepository.findByDate(challengeDate)
  if (existingChallenge) {
    log.info(
      { challengeId: existingChallenge.id, challengeDate },
      'Challenge already exists for date, skipping creation'
    )

    onProgress?.(4, 5, 'Ending all in-progress games...')
    const endGamesResult = await endAllInProgressGames()
    log.info(
      { ended: endGamesResult.ended, failed: endGamesResult.failed },
      'Finished ending in-progress games'
    )

    return {
      created: false,
      challengeId: existingChallenge.id,
      challengeDate,
      screenshotsAssigned: 0,
      message: `Challenge already exists for ${challengeDate} (ID: ${existingChallenge.id}). Ended ${endGamesResult.ended} in-progress games.`,
    }
  }

  onProgress?.(1, 5, 'Selecting random screenshots...')

  const screenshotIds = await selectRandomScreenshots(10)
  log.info({ count: screenshotIds.length }, 'Selected screenshots for challenge')

  onProgress?.(2, 5, 'Creating daily challenge entry...')

  const challenge = await challengeRepository.create(challengeDate)
  log.info({ challengeId: challenge.id }, 'Created daily challenge')

  onProgress?.(3, 5, 'Creating tier and assigning screenshots...')

  const tier = await challengeRepository.createTier({
    dailyChallengeId: challenge.id,
    tierNumber: 1,
    name: 'Daily Challenge',
    timeLimitSeconds: 45,
  })

  await challengeRepository.createTierScreenshots(tier.id, screenshotIds)

  onProgress?.(4, 5, 'Ending all in-progress games...')

  const endGamesResult = await endAllInProgressGames()
  log.info(
    { ended: endGamesResult.ended, failed: endGamesResult.failed },
    'Finished ending in-progress games'
  )

  onProgress?.(5, 5, 'Daily challenge created successfully!')

  const result: DailyChallengeResult = {
    created: true,
    challengeId: challenge.id,
    challengeDate,
    screenshotsAssigned: screenshotIds.length,
    message: `Created daily challenge for ${challengeDate} with ${screenshotIds.length} screenshots. Ended ${endGamesResult.ended} in-progress games.`,
  }

  log.info(result, 'Daily challenge creation complete')
  return result
}
