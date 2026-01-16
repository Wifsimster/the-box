/**
 * Recalculate Scores Logic
 *
 * This module handles recalculating scores for all completed game sessions with:
 * - Batch processing with configurable batch size
 * - Pause/Resume capability
 * - Progress persistence to database
 * - Optional date range filtering
 * - Dry-run mode for validation
 */

import { Job as BullJob } from 'bullmq'
import type { Knex } from 'knex'
import { queueLogger } from '../../logger/logger.js'
import { importStateRepository } from '../../repositories/import-state.repository.js'
import { importQueue } from '../queues.js'
import { db } from '../../database/connection.js'
import { broadcastRecalculateScoresProgress } from '../../socket/socket.js'
import type { ImportState, JobData } from '@the-box/types'

const log = queueLogger.child({ module: 'recalculate-scores' })

// Constants from game.service.ts
const BASE_SCORE = 100
const HINT_PENALTY_MULTIPLIER = 0.20

// Progress callback type
export type RecalculateProgressCallback = (
    current: number,
    total: number,
    message: string,
    state: ImportState
) => void

// Job result type
export interface RecalculateScoresResult {
    sessionsProcessed: number
    sessionsUpdated: number
    sessionsSkipped: number
    totalScoreChanges: number
    isPaused: boolean
    isComplete: boolean
    recalculateStateId: number
    currentBatch: number
    totalBatches: number | null
    dryRun: boolean
}

// Timing utilities
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
}

function calculateETA(processed: number, total: number, elapsedMs: number): string {
    if (processed === 0) return 'calculating...'
    const avgTimePerSession = elapsedMs / processed
    const remainingSessions = total - processed
    const remainingMs = avgTimePerSession * remainingSessions
    return formatDuration(remainingMs)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate speed multiplier based on time taken
 * From game.service.ts calculateSpeedMultiplier function
 */
function calculateSpeedMultiplier(timeTakenMs: number): number {
    const timeTakenSeconds = timeTakenMs / 1000

    if (timeTakenSeconds < 3) {
        return 2.0 // 200 points
    } else if (timeTakenSeconds < 5) {
        return 1.75 // 175 points
    } else if (timeTakenSeconds < 10) {
        return 1.5 // 150 points
    } else if (timeTakenSeconds < 20) {
        return 1.25 // 125 points
    } else {
        return 1.0 // 100 points
    }
}

/**
 * Calculate score for a single guess
 */
function calculateGuessScore(
    isCorrect: boolean,
    timeTakenMs: number,
    powerUpUsed: string | null
): number {
    if (!isCorrect) {
        return 0
    }

    const speedMultiplier = calculateSpeedMultiplier(timeTakenMs)
    let scoreEarned = Math.round(BASE_SCORE * speedMultiplier)
    // Cap max score per screenshot at 200 points
    scoreEarned = Math.min(scoreEarned, 200)

    // Calculate hint penalty as 20% of earned score (after speed multiplier)
    if (powerUpUsed === 'hint_year' || powerUpUsed === 'hint_publisher') {
        const hintPenalty = Math.round(scoreEarned * HINT_PENALTY_MULTIPLIER)
        scoreEarned -= hintPenalty
    }

    // Ensure non-negative
    return Math.max(0, scoreEarned)
}

/**
 * Recalculate score for a single session
 */
async function recalculateSessionScore(
    sessionId: string,
    dryRun: boolean
): Promise<{ oldScore: number; newScore: number; changed: boolean }> {
    // Get current session score
    const session = await db('game_sessions')
        .where('id', sessionId)
        .select('total_score')
        .first()

    if (!session) {
        throw new Error(`Session ${sessionId} not found`)
    }

    const oldScore = session.total_score || 0

    // Get all guesses for this session with timing data
    const guesses = await db('guesses')
        .join('tier_sessions', 'guesses.tier_session_id', 'tier_sessions.id')
        .where('tier_sessions.game_session_id', sessionId)
        .select(
            'guesses.id',
            'guesses.is_correct',
            'guesses.time_taken_ms',
            'guesses.power_up_used',
            'guesses.score_earned as old_guess_score'
        )
        .orderBy('guesses.created_at', 'asc')

    // Recalculate total score based ONLY on actual guesses
    // This removes any unfound penalties that were applied when ending early
    let newScore = 0
    const guessUpdates: Array<{ id: number; oldScore: number; newScore: number }> = []

    for (const guess of guesses) {
        const guessScore = calculateGuessScore(
            guess.is_correct,
            guess.time_taken_ms || 0,
            guess.power_up_used
        )
        newScore += guessScore

        if (guessScore !== (guess.old_guess_score || 0)) {
            guessUpdates.push({
                id: guess.id,
                oldScore: guess.old_guess_score || 0,
                newScore: guessScore,
            })
        }
    }

    const changed = oldScore !== newScore

    // Update database if not dry run and score changed
    if (!dryRun && changed) {
        await db.transaction(async (trx: Knex.Transaction) => {
            // Update session total score
            await trx('game_sessions').where('id', sessionId).update({
                total_score: newScore,
            })

            // Update individual guess scores
            for (const update of guessUpdates) {
                await trx('guesses').where('id', update.id).update({
                    score_earned: update.newScore,
                })
            }
        })

        log.info(
            `Session ${sessionId} score updated: ${oldScore} → ${newScore} (${guessUpdates.length} guesses updated)`
        )
    } else if (changed) {
        log.info(
            `[DRY RUN] Session ${sessionId} would be updated: ${oldScore} → ${newScore} (${guessUpdates.length} guesses)`
        )
    }

    return { oldScore, newScore, changed }
}

/**
 * Process recalculate scores job
 */
export async function processRecalculateScoresJob(
    job: BullJob<JobData>,
    progressCallback?: RecalculateProgressCallback
): Promise<RecalculateScoresResult> {
    const jobData = job.data
    const batchSize = jobData.batchSize || 100
    const dryRun = jobData.dryRun || false
    const startDate = jobData.startDate ? new Date(jobData.startDate) : null
    const endDate = jobData.endDate ? new Date(jobData.endDate) : null

    log.info(
        `Starting score recalculation job ${job.id} (batchSize: ${batchSize}, dryRun: ${dryRun}, dateRange: ${startDate ? startDate.toISOString() : 'all'} to ${endDate ? endDate.toISOString() : 'now'})`
    )

    // Check for existing state (resume scenario)
    let state = await importStateRepository.findActiveByType('recalculate-scores')

    if (!state) {
        // Create new state
        state = await importStateRepository.create({
            importType: 'recalculate-scores',
            batchSize,
        })
        // Manually set status to in_progress after creation
        await importStateRepository.setStatus(state.id, 'in_progress')
    } else {
        // Resume existing state
        await importStateRepository.setStatus(state.id, 'in_progress')
        log.info(`Resuming recalculation from batch ${state.currentBatch}`)
    }

    const startTime = Date.now()
    let sessionsProcessed = state.gamesProcessed || 0
    let sessionsUpdated = state.gamesImported || 0
    let sessionsSkipped = state.gamesSkipped || 0
    let totalScoreChanges = 0
    let currentBatch = state.currentBatch || 0

    try {
        // Build query for completed sessions
        let query = db('game_sessions').where('is_completed', true)

        if (startDate) {
            query = query.where('started_at', '>=', startDate)
        }
        if (endDate) {
            query = query.where('started_at', '<=', endDate)
        }

        // Get total count
        const countResult = await query.clone().count('* as count').first()
        const totalSessions = Number(countResult?.count || 0)

        log.info(`Found ${totalSessions} completed sessions to process`)

        if (totalSessions === 0) {
            await importStateRepository.setStatus(state.id, 'completed')
            return {
                sessionsProcessed: 0,
                sessionsUpdated: 0,
                sessionsSkipped: 0,
                totalScoreChanges: 0,
                isPaused: false,
                isComplete: true,
                recalculateStateId: state.id,
                currentBatch: 0,
                totalBatches: 0,
                dryRun,
            }
        }

        // Update total items in state
        if (!state.totalGamesAvailable || state.totalGamesAvailable === 0) {
            await importStateRepository.update(state.id, { totalGamesAvailable: totalSessions })
        }

        const totalBatches = Math.ceil(totalSessions / batchSize)

        // Process in batches
        while (currentBatch < totalBatches) {
            // Check for pause signal
            const freshState = await importStateRepository.findById(state.id)
            if (freshState?.status === 'paused') {
                log.info(`Recalculation paused at batch ${currentBatch}`)
                return {
                    sessionsProcessed,
                    sessionsUpdated,
                    sessionsSkipped,
                    totalScoreChanges,
                    isPaused: true,
                    isComplete: false,
                    recalculateStateId: state.id,
                    currentBatch,
                    totalBatches,
                    dryRun,
                }
            }

            const offset = currentBatch * batchSize
            const sessions = await query
                .clone()
                .select('id', 'total_score')
                .orderBy('started_at', 'asc')
                .limit(batchSize)
                .offset(offset)

            log.info(
                `Processing batch ${currentBatch + 1}/${totalBatches} (${sessions.length} sessions)`
            )

            // Process each session
            for (const session of sessions) {
                try {
                    const result = await recalculateSessionScore(session.id, dryRun)

                    if (result.changed) {
                        sessionsUpdated++
                        totalScoreChanges += Math.abs(result.newScore - result.oldScore)
                    } else {
                        sessionsSkipped++
                    }

                    sessionsProcessed++

                    // Update progress
                    const elapsedMs = Date.now() - startTime
                    const eta = calculateETA(sessionsProcessed, totalSessions, elapsedMs)
                    const progressMessage = dryRun
                        ? `[DRY RUN] Processing session ${sessionsProcessed}/${totalSessions} (${sessionsUpdated} would be updated, ${sessionsSkipped} unchanged) - ETA: ${eta}`
                        : `Processing session ${sessionsProcessed}/${totalSessions} (${sessionsUpdated} updated, ${sessionsSkipped} unchanged) - ETA: ${eta}`

                    await importStateRepository.updateProgress(state.id, {
                        gamesProcessed: sessionsProcessed,
                        gamesImported: sessionsUpdated,
                        gamesSkipped: sessionsSkipped,
                        currentBatch,
                    })

                    if (progressCallback) {
                        progressCallback(sessionsProcessed, totalSessions, progressMessage, {
                            ...state,
                            gamesProcessed: sessionsProcessed,
                            gamesImported: sessionsUpdated,
                            gamesSkipped: sessionsSkipped,
                        })
                    }

                    // Small delay to avoid overwhelming the database
                    await sleep(10)
                } catch (error) {
                    log.error({ err: error, sessionId: session.id }, `Error recalculating session ${session.id}`)
                    // Continue with next session
                }
            }

            currentBatch++

            // Update current batch in state
            await importStateRepository.updateProgress(state.id, { currentBatch })

            // Broadcast progress via WebSocket
            const updatedState = await importStateRepository.findById(state.id)
            if (updatedState) {
                const progress = totalSessions > 0 ? Math.round((sessionsProcessed / totalSessions) * 100) : 0
                broadcastRecalculateScoresProgress({
                    recalculateStateId: updatedState.id,
                    progress,
                    status: updatedState.status,
                    message: `Batch ${currentBatch}/${totalBatches || '?'} completed`,
                    sessionsProcessed,
                    sessionsUpdated,
                    sessionsSkipped,
                    totalScoreChanges,
                    currentBatch,
                    totalBatches,
                    dryRun,
                })
            }

            // Delay between batches
            await sleep(100)
        }

        // Mark as completed
        await importStateRepository.setStatus(state.id, 'completed')

        // Broadcast final progress
        const finalState = await importStateRepository.findById(state.id)
        if (finalState) {
            broadcastRecalculateScoresProgress({
                recalculateStateId: finalState.id,
                progress: 100,
                status: 'completed',
                message: dryRun
                    ? `[DRY RUN] Would update ${sessionsUpdated} sessions (${sessionsSkipped} unchanged, total score changes: ${totalScoreChanges})`
                    : `Complete! ${sessionsUpdated} sessions updated (${sessionsSkipped} unchanged, total score changes: ${totalScoreChanges})`,
                sessionsProcessed,
                sessionsUpdated,
                sessionsSkipped,
                totalScoreChanges,
                currentBatch,
                totalBatches,
                dryRun,
            })
        }

        const elapsedMs = Date.now() - startTime
        const duration = formatDuration(elapsedMs)

        log.info(
            `Score recalculation completed in ${duration}: ${sessionsProcessed} sessions processed, ${sessionsUpdated} updated, ${sessionsSkipped} unchanged, total score changes: ${totalScoreChanges}${dryRun ? ' (DRY RUN)' : ''}`
        )

        return {
            sessionsProcessed,
            sessionsUpdated,
            sessionsSkipped,
            totalScoreChanges,
            isPaused: false,
            isComplete: true,
            recalculateStateId: state.id,
            currentBatch,
            totalBatches,
            dryRun,
        }
    } catch (error) {
        log.error({ err: error }, 'Score recalculation failed')
        await importStateRepository.setStatus(state.id, 'failed')
        throw error
    }
}

/**
 * Start a new score recalculation job
 */
export async function startRecalculateScores(config: {
    batchSize?: number
    dryRun?: boolean
    startDate?: string
    endDate?: string
}): Promise<{ recalculateState: ImportState; job: { id: string; name: string } }> {
    // Create new import state
    const recalculateState = await importStateRepository.create({
        importType: 'recalculate-scores',
        batchSize: config.batchSize || 100,
    })

    // Create and start the job
    const job = await importQueue.add(
        'recalculate-scores',
        {
            recalculateStateId: recalculateState.id,
            batchSize: config.batchSize || 100,
            dryRun: config.dryRun || false,
            startDate: config.startDate,
            endDate: config.endDate,
            isResume: false,
        },
        {
            jobId: `recalculate-scores-${recalculateState.id}-${Date.now()}`,
            priority: 5, // Medium priority
        }
    )

    log.info({ recalculateStateId: recalculateState.id, jobId: job.id }, 'Score recalculation job started')

    return { recalculateState, job: { id: job.id!, name: job.name! } }
}

/**
 * Get active recalculation state (if any)
 */
export async function getActiveRecalculateScores(): Promise<ImportState | null> {
    return importStateRepository.findActiveByType('recalculate-scores')
}

/**
 * Get recalculation state by ID
 */
export async function getRecalculateScoresState(id: number): Promise<ImportState | null> {
    return importStateRepository.findById(id)
}

/**
 * Pause ongoing recalculation
 */
export async function pauseRecalculateScores(id: number): Promise<ImportState> {
    const state = await importStateRepository.findById(id)
    if (!state) {
        throw new Error(`Recalculation state ${id} not found`)
    }

    if (state.status !== 'in_progress') {
        throw new Error(`Cannot pause recalculation in status: ${state.status}`)
    }

    const updated = await importStateRepository.setStatus(id, 'paused')
    if (!updated) {
        throw new Error(`Failed to pause recalculation ${id}`)
    }

    log.info({ recalculateStateId: id }, 'Score recalculation paused')
    return updated
}

/**
 * Resume paused recalculation
 */
export async function resumeRecalculateScores(id: number): Promise<{ recalculateState: ImportState; job: { id: string; name: string } }> {
    const state = await importStateRepository.findById(id)
    if (!state) {
        throw new Error(`Recalculation state ${id} not found`)
    }

    if (state.status !== 'paused') {
        throw new Error(`Cannot resume recalculation in status: ${state.status}`)
    }

    // Resume the state
    await importStateRepository.setStatus(id, 'in_progress')

    // Create a new job to continue
    const job = await importQueue.add(
        'recalculate-scores',
        {
            recalculateStateId: state.id,
            batchSize: state.batchSize,
            isResume: true,
        },
        {
            jobId: `recalculate-scores-${state.id}-resume-${Date.now()}`,
            priority: 5,
        }
    )

    const updatedState = await importStateRepository.findById(id)
    if (!updatedState) {
        throw new Error(`Failed to get updated recalculation state ${id}`)
    }

    log.info({ recalculateStateId: id, jobId: job.id }, 'Score recalculation resumed')
    return { recalculateState: updatedState, job: { id: job.id!, name: job.name! } }
}
