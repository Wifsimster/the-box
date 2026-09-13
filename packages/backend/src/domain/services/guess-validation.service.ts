/**
 * Guess validation — the two server-authoritative decisions that stand
 * between a submitted guess and the scoring pipeline.
 *
 * Both are anti-cheat measures, and both were buried a few hundred lines
 * into `submitGuess`. Pulling them out makes them directly testable: an
 * exploit attempt is now a one-line unit test rather than a full submission
 * driven through a dozen repository fakes.
 *
 * Pure — the clock is injected, so "the client claims it answered in 1ms"
 * is a deterministic test, not a timing-dependent one.
 */
import type { MatchPrecision } from './fuzzy-match.service.js'

/** Divergence beyond this between server and client elapsed is worth logging. */
export const TIMER_DIVERGENCE_WARN_MS = 2000

export interface MatchEvaluation {
  matched: boolean
  precision: MatchPrecision
}

export interface ResolvePrecisionInput {
  /** The player's raw text, already trimmed. */
  trimmedGuess: string
  /** The graded result from the fuzzy matcher, or null when the text was empty. */
  matchResult: MatchEvaluation | null
  /** Game id picked from autocomplete, if any. */
  submittedGameId: number | null
  /** The game the screenshot actually belongs to. */
  answerGameId: number
}

/**
 * Decide how precisely the player identified the game.
 *
 * Correctness REQUIRES non-empty text. The `gameId` path used to win on its
 * own; combined with image-proxy enumeration — which lets any logged-in user
 * discover the screenshot-to-gameId mapping — an empty-text submit carrying a
 * known gameId was a one-shot answer leak. So the matcher wins on its own,
 * and `gameId` now only breaks a tie for ambiguous text (an autocomplete
 * pick, where the player did type something).
 *
 * `exact` means the full title; `partial` means the franchise was named but
 * the sequel number or subtitle was omitted, which still solves the position
 * at a reduced score.
 */
export function resolveMatchPrecision(input: ResolvePrecisionInput): MatchPrecision {
  const { trimmedGuess, matchResult, submittedGameId, answerGameId } = input

  // No text, no credit — regardless of what gameId was submitted.
  if (trimmedGuess === '') return 'none'

  if (matchResult && matchResult.precision !== 'none') {
    return matchResult.precision
  }

  // Tiebreaker only: the player typed something AND picked the right game
  // from autocomplete, but their text didn't clear the fuzzy matcher.
  if (submittedGameId !== null && submittedGameId === answerGameId) {
    return 'exact'
  }

  return 'none'
}

export interface RoundTimerInput {
  /** When the server served this position, or null if it never did. */
  roundStartedAt: Date | string | null
  /** The position the server last stamped a timer for. */
  stampedPosition: number | null
  /** The position being submitted. */
  submittedPosition: number
  /** The client's self-reported elapsed time. */
  clientElapsedMs: number
  /** Injected clock. */
  now: number
}

export type RoundTimerResult =
  | { valid: false }
  | {
      valid: true
      serverElapsedMs: number
      /** What scoring should use. */
      effectiveTimeTakenMs: number
      /** True when server and client disagree enough to be worth a log line. */
      diverged: boolean
    }

/**
 * Validate and resolve the round timer.
 *
 * The client submits its own elapsed time; we treat that as a hint and take
 * `max(server, client)`. Lower elapsed means a higher speed multiplier, so
 * favouring the LARGER value defeats the trivial `{ roundTimeTakenMs: 1 }`
 * cheat without penalising a user whose clock runs slightly fast.
 *
 * Valid round metadata is required before scoring. The old behaviour ("if
 * NULL, trust the client") opened a window any time the database blipped
 * during getScreenshot, or the client POSTed out of order. An invalid result
 * means refuse the submit, not fall back.
 */
export function resolveRoundTimer(input: RoundTimerInput): RoundTimerResult {
  const { roundStartedAt, stampedPosition, submittedPosition, clientElapsedMs, now } = input

  if (roundStartedAt == null || stampedPosition !== submittedPosition) {
    return { valid: false }
  }

  const startedAtMs = new Date(roundStartedAt).getTime()
  if (!Number.isFinite(startedAtMs)) return { valid: false }

  // Clamped at 0: a clock adjustment must never yield negative elapsed, which
  // would sail past every speed tier.
  const serverElapsedMs = Math.max(0, now - startedAtMs)
  const effectiveTimeTakenMs = Math.max(serverElapsedMs, clientElapsedMs)

  return {
    valid: true,
    serverElapsedMs,
    effectiveTimeTakenMs,
    diverged: Math.abs(serverElapsedMs - clientElapsedMs) > TIMER_DIVERGENCE_WARN_MS,
  }
}
