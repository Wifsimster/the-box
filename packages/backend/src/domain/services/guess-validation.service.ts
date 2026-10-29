import type { MatchPrecision } from './fuzzy-match.service.js'

export const TIMER_DIVERGENCE_WARN_MS = 2000

export interface MatchEvaluation {
  matched: boolean
  precision: MatchPrecision
}

export interface ResolvePrecisionInput {
  trimmedGuess: string
  matchResult: MatchEvaluation | null
  submittedGameId: number | null
  answerGameId: number
}

export function resolveMatchPrecision(input: ResolvePrecisionInput): MatchPrecision {
  const { trimmedGuess, matchResult, submittedGameId, answerGameId } = input

  if (trimmedGuess === '') return 'none'

  if (matchResult && matchResult.precision !== 'none') {
    return matchResult.precision
  }

  if (submittedGameId !== null && submittedGameId === answerGameId) {
    return 'exact'
  }

  return 'none'
}

export interface RoundTimerInput {
  roundStartedAt: Date | string | null
  stampedPosition: number | null
  submittedPosition: number
  clientElapsedMs: number
  now: number
}

export type RoundTimerResult =
  | { valid: false }
  | {
      valid: true
      serverElapsedMs: number
      effectiveTimeTakenMs: number
      diverged: boolean
    }

export function resolveRoundTimer(input: RoundTimerInput): RoundTimerResult {
  const { roundStartedAt, stampedPosition, submittedPosition, clientElapsedMs, now } = input

  if (roundStartedAt == null || stampedPosition !== submittedPosition) {
    return { valid: false }
  }

  const startedAtMs = new Date(roundStartedAt).getTime()
  if (!Number.isFinite(startedAtMs)) return { valid: false }

  const serverElapsedMs = Math.max(0, now - startedAtMs)
  const effectiveTimeTakenMs = Math.max(serverElapsedMs, clientElapsedMs)

  return {
    valid: true,
    serverElapsedMs,
    effectiveTimeTakenMs,
    diverged: Math.abs(serverElapsedMs - clientElapsedMs) > TIMER_DIVERGENCE_WARN_MS,
  }
}
