/**
 * "Describe the game" — shadow mode.
 *
 * A player who can't find the title may describe the game once per
 * screenshot. A judge model picks the game among the target and ~10
 * catalogue distractors and gives a probability. In shadow mode NOTHING is
 * scored: the description and the verdict are stored so the acceptance
 * threshold and a partial-points scale can be fixed on real data later.
 *
 * This service owns the three pure decisions (candidate selection, the title
 * pre-filter, the verdict) plus the submission rules. The model call goes
 * through the `DescribeJudge` port; it is bounded by a timeout and can never
 * fail the request: on timeout or error the row is stored with no verdict.
 *
 * Offline spike behind the numbers below: branch `spike/describe-guess`,
 * `spikes/describe-guess/REPORT.md` (Claude Haiku 5.5 at 0.8: 0 false
 * acceptances on vague, wrong and injection descriptions).
 */
import type { DomainLogger } from '../ports/logger.js'
import {
  DescribeJudgeError,
  type DescribeGameSheet,
  type DescribeJudge,
  type DescribeJudgeCandidate,
  type DescribeJudgeErrorCode,
} from '../ports/describe-judge.js'
import type { FuzzyMatchService } from './fuzzy-match.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** The model "accepts" when it picks the target with at least this probability. */
export const DESCRIBE_ACCEPT_THRESHOLD = 0.8
export const DESCRIBE_MIN_LENGTH = 15
export const DESCRIBE_MAX_LENGTH = 200
/** Distractors shown next to the target. */
export const DESCRIBE_DISTRACTOR_COUNT = 10
/** At most this many distractors from the target's series… */
export const DESCRIBE_SAME_SERIES_MAX = 2
/** …and at most this many related distractors in total (series + genre). */
export const DESCRIBE_RELATED_MAX = 4
/** Hard ceiling on the judgement. The adapter uses the same budget. */
export const DESCRIBE_JUDGE_TIMEOUT_MS = 5000
export const DESCRIBE_LOCALES = ['fr', 'en'] as const
export type DescribeLocale = (typeof DESCRIBE_LOCALES)[number]

/** Longest word window the title pre-filter tries. */
const PREFILTER_MAX_WINDOW = 6

// ─────────────────────────────────────────────────────────────────────────────
// Candidate selection
// ─────────────────────────────────────────────────────────────────────────────

export interface CandidatePools {
  /** Games from the target's series (same title root), any order. */
  sameSeries: DescribeGameSheet[]
  /** Games sharing genres with the target, any order. */
  sameGenre: DescribeGameSheet[]
  /** Random catalogue games. */
  random: DescribeGameSheet[]
}

/** Uniform random in [0, 1). Injected so selection is deterministic in tests. */
export type Rng = () => number

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The target plus `DESCRIBE_DISTRACTOR_COUNT` distractors, shuffled.
 *
 * The spike drew the 10 nearest neighbours of the target, which made the
 * target the centroid of the set: "pick the candidate most similar to the
 * others" found it 21 % of the time against 9 % for chance (spike limit #5).
 * Here at most `DESCRIBE_RELATED_MAX` distractors are related (at most
 * `DESCRIBE_SAME_SERIES_MAX` from the series, the rest sharing genres), each
 * drawn at random within its pool rather than by nearness. The rest are
 * random catalogue games. A vague description therefore can't win by
 * pointing at "the cluster", and a precise one still has look-alikes to
 * beat.
 *
 * Games with the target's exact name (re-releases, duplicates) are excluded:
 * the model could not tell them apart.
 */
export function selectCandidates(
  target: DescribeGameSheet,
  pools: CandidatePools,
  rng: Rng,
  distractorCount: number = DESCRIBE_DISTRACTOR_COUNT
): DescribeGameSheet[] {
  const taken = new Set<number>([target.id])
  const takenNames = new Set<string>([nameKey(target.name)])
  const picked: DescribeGameSheet[] = []

  const take = (pool: readonly DescribeGameSheet[], max: number): void => {
    for (const game of shuffle(pool, rng)) {
      if (picked.length >= distractorCount || max <= 0) return
      const key = nameKey(game.name)
      if (taken.has(game.id) || takenNames.has(key)) continue
      taken.add(game.id)
      takenNames.add(key)
      picked.push(game)
      max--
    }
  }

  take(pools.sameSeries, DESCRIBE_SAME_SERIES_MAX)
  take(pools.sameGenre, DESCRIBE_RELATED_MAX - picked.length)
  take(pools.random, distractorCount - picked.length)
  // Small catalogue: top up from whatever related games are left.
  take([...pools.sameSeries, ...pools.sameGenre], distractorCount - picked.length)

  return shuffle([target, ...picked], rng)
}

// ─────────────────────────────────────────────────────────────────────────────
// Title pre-filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when the description names a candidate: some run of 1 to
 * `PREFILTER_MAX_WINDOW` consecutive words is an `exact` match for the
 * candidate's title or one of its aliases, per the same matcher that grades
 * title guesses. A franchise word alone ("mario") is `partial` and does not
 * count.
 *
 * In shadow mode the hit is only recorded. Once points exist, a hit must not
 * earn them: the player typed a title, so it is a title attempt. Known false
 * positives from the spike: titles that are also a character or common noun
 * ("zagreus fils d'hades" names Hades).
 */
export function titlePrefilterHit(
  description: string,
  candidates: readonly DescribeGameSheet[],
  fuzzy: Pick<FuzzyMatchService, 'isMatch'>
): boolean {
  // Apostrophes split too, so an elided article ("d'hades") doesn't hide a title.
  const words = description.split(/[\s'’]+/).filter(Boolean)
  const initials = words.map((w) => nameKey(w).charAt(0))

  for (const candidate of candidates) {
    // Cheap gate before the matcher (which re-parses the title per call):
    // a window that names the title starts with a word sharing its first
    // letter with a title or alias word (acronyms, glued runs and typos
    // keep it), and is at most two words longer than the longest form.
    const forms = [candidate.name, ...candidate.aliases].map((f) => nameKey(f).split(' ').filter(Boolean))
    const firstLetters = new Set(forms.flat().map((w) => w.charAt(0)))
    const maxLen = Math.min(PREFILTER_MAX_WINDOW, Math.max(...forms.map((f) => f.length)) + 2)

    for (let start = 0; start < words.length; start++) {
      if (!firstLetters.has(initials[start]!)) continue
      for (let len = 1; len <= maxLen && start + len <= words.length; len++) {
        const window = words.slice(start, start + len).join(' ')
        if (fuzzy.isMatch(window, candidate.name, candidate.aliases)) return true
      }
    }
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedVerdict {
  chosenLabel: string
  /** Normalised probability of the chosen candidate, in [0, 1]. */
  probability: number
}

/**
 * Validate the judge's structured output and pick its answer.
 *
 * Expected shape: `{ game_id: <label>, probabilities: { <label>: number } }`.
 * Probabilities are clamped at 0 and renormalised over the known labels
 * (models drift from an exact sum of 1; unknown keys are ignored). The
 * answer is the arg-max of the normalised probabilities, as in the spike,
 * not the self-reported `game_id`. Throws `invalid_output` when nothing
 * usable remains.
 */
export function parseVerdict(raw: unknown, labels: readonly string[]): ParsedVerdict {
  if (!raw || typeof raw !== 'object') {
    throw new DescribeJudgeError('invalid_output', 'output is not an object')
  }
  const probabilities = (raw as { probabilities?: unknown }).probabilities
  if (!probabilities || typeof probabilities !== 'object') {
    throw new DescribeJudgeError('invalid_output', 'missing probabilities')
  }

  const values = labels.map((label) => {
    const v = (probabilities as Record<string, unknown>)[label]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
  })
  const sum = values.reduce((a, b) => a + b, 0)
  if (sum <= 0) {
    throw new DescribeJudgeError('invalid_output', 'probabilities sum to zero')
  }

  let best = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[best]!) best = i
  }
  return { chosenLabel: labels[best]!, probability: values[best]! / sum }
}

/** The model verdict at the threshold. Shadow mode: recorded, never scored. */
export function isAccepted(
  chosenGameId: number | null,
  probability: number | null,
  targetGameId: number
): boolean | null {
  if (chosenGameId === null || probability === null) return null
  return chosenGameId === targetGameId && probability >= DESCRIBE_ACCEPT_THRESHOLD
}

export function candidateLabel(index: number): string {
  return `c${String(index + 1).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Judgement
// ─────────────────────────────────────────────────────────────────────────────

export interface DescribeEvaluation {
  candidateGameIds: number[]
  chosenGameId: number | null
  probability: number | null
  accepted: boolean | null
  titlePrefilterHit: boolean
  model: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  error: DescribeJudgeErrorCode | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission
// ─────────────────────────────────────────────────────────────────────────────

export class DescribeGuessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'DescribeGuessError'
  }
}

/** Narrow session view the submission rules need. */
export interface DescribeTierSession {
  user_id: string
  game_session_id: string
  daily_challenge_id: number
  game_is_completed: boolean
}

export interface DescribeSessionPort {
  findTierSessionWithContext(tierSessionId: string): Promise<DescribeTierSession | null>
  hasWrongGuessForPosition(tierSessionId: string, position: number): Promise<boolean>
  hasCorrectGuessForPosition(tierSessionId: string, position: number): Promise<boolean>
  /**
   * Push `round_started_at` forward by `ms` when `position` is still the
   * stamped round, so judgement latency never counts as answer time.
   */
  shiftRoundStart(tierSessionId: string, position: number, ms: number): Promise<void>
}

export interface DescribeChallengePort {
  findTiersByChallenge(challengeId: number): Promise<Array<{ id: number }>>
  findScreenshotAtPosition(
    tierId: number,
    position: number
  ): Promise<{ screenshot_id: number } | null | undefined>
}

export interface DescribeClaim {
  userId: string
  isGuest: boolean
  gameSessionId: string
  tierSessionId: string
  position: number
  screenshotId: number
  targetGameId: number
  description: string
  locale: DescribeLocale
  model: string
}

export interface DescribeAttemptPort {
  /** Sheet of the game behind a screenshot, or null. */
  findTargetSheet(screenshotId: number): Promise<DescribeGameSheet | null>
  findCandidatePools(target: DescribeGameSheet, seriesName: string | null): Promise<CandidatePools>
  /**
   * Insert the attempt row with `error = 'pending'`. Returns its id, or null
   * when this (tier session, position) already has a description.
   */
  claim(claim: DescribeClaim): Promise<number | null>
  complete(id: number, evaluation: DescribeEvaluation): Promise<void>
}

export interface DescribeGuessServiceDeps {
  judge: DescribeJudge
  fuzzy: Pick<FuzzyMatchService, 'isMatch' | 'parseGameTitle'>
  sessions: DescribeSessionPort
  challenges: DescribeChallengePort
  attempts: DescribeAttemptPort
  logger: DomainLogger
  rng?: Rng
  now?: () => number
  timeoutMs?: number
}

export interface SubmitDescriptionInput {
  userId: string
  isGuest: boolean
  tierSessionId: string
  screenshotId: number
  position: number
  description: string
  locale: DescribeLocale
}

export interface DescribeGuessService {
  /**
   * Run the judge on an already-selected candidate set. Never throws: a
   * timeout or judge failure comes back as `error` with no verdict.
   */
  evaluate(input: {
    description: string
    locale: DescribeLocale
    target: DescribeGameSheet
    candidates: DescribeGameSheet[]
  }): Promise<DescribeEvaluation>
  /**
   * Validate the request, store the description, judge it, store the
   * verdict. Throws `DescribeGuessError` for a rule violation only.
   * The returned evaluation is for logging and tests; the route never sends
   * it to the client (it would leak the answer).
   */
  submit(input: SubmitDescriptionInput): Promise<DescribeEvaluation>
}

export function createDescribeGuessService(deps: DescribeGuessServiceDeps): DescribeGuessService {
  const log = deps.logger.child({ service: 'describe-guess' })
  const rng = deps.rng ?? Math.random
  const now = deps.now ?? Date.now
  const timeoutMs = deps.timeoutMs ?? DESCRIBE_JUDGE_TIMEOUT_MS

  async function evaluate(input: {
    description: string
    locale: DescribeLocale
    target: DescribeGameSheet
    candidates: DescribeGameSheet[]
  }): Promise<DescribeEvaluation> {
    const { description, locale, target, candidates } = input
    const labelled: DescribeJudgeCandidate[] = candidates.map((sheet, i) => ({
      label: candidateLabel(i),
      sheet,
    }))
    const labels = labelled.map((c) => c.label)
    const prefilter = titlePrefilterHit(description, candidates, deps.fuzzy)

    const base: DescribeEvaluation = {
      candidateGameIds: candidates.map((c) => c.id),
      chosenGameId: null,
      probability: null,
      accepted: null,
      titlePrefilterHit: prefilter,
      model: deps.judge.model,
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
      error: null,
    }

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new DescribeJudgeError('timeout', `judge exceeded ${timeoutMs} ms`))
      }, timeoutMs)
    })

    const started = now()
    try {
      const output = await Promise.race([
        deps.judge.judge({ description, locale, candidates: labelled }, controller.signal),
        deadline,
      ])
      base.inputTokens = output.inputTokens
      base.outputTokens = output.outputTokens
      const verdict = parseVerdict(output.raw, labels)
      const chosen = labelled.find((c) => c.label === verdict.chosenLabel)!
      base.chosenGameId = chosen.sheet.id
      base.probability = verdict.probability
      base.accepted = isAccepted(chosen.sheet.id, verdict.probability, target.id)
    } catch (error) {
      base.error = error instanceof DescribeJudgeError ? error.code : 'unknown'
      log.warn(
        { code: base.error, err: error instanceof Error ? error.message : String(error) },
        'describe-guess judge failed; storing without a verdict'
      )
    } finally {
      clearTimeout(timer)
      base.latencyMs = Math.max(0, Math.round(now() - started))
    }
    return base
  }

  async function submit(input: SubmitDescriptionInput): Promise<DescribeEvaluation> {
    const description = input.description.trim().replace(/\s+/g, ' ')
    if (description.length < DESCRIBE_MIN_LENGTH || description.length > DESCRIBE_MAX_LENGTH) {
      throw new DescribeGuessError(
        'INVALID_DESCRIPTION',
        `Description must be ${DESCRIBE_MIN_LENGTH}-${DESCRIBE_MAX_LENGTH} characters`,
        400
      )
    }

    const session = await deps.sessions.findTierSessionWithContext(input.tierSessionId)
    if (!session || session.user_id !== input.userId) {
      throw new DescribeGuessError('SESSION_NOT_FOUND', 'Session not found', 404)
    }
    if (session.game_is_completed) {
      throw new DescribeGuessError('SESSION_ALREADY_COMPLETED', 'Session already completed', 409)
    }

    const tiers = await deps.challenges.findTiersByChallenge(session.daily_challenge_id)
    const tier = tiers[0]
    const served = tier
      ? await deps.challenges.findScreenshotAtPosition(tier.id, input.position)
      : null
    if (!served || served.screenshot_id !== input.screenshotId) {
      throw new DescribeGuessError(
        'SCREENSHOT_POSITION_MISMATCH',
        'Screenshot does not match this position',
        400
      )
    }

    const [solved, triedTitle] = await Promise.all([
      deps.sessions.hasCorrectGuessForPosition(input.tierSessionId, input.position),
      deps.sessions.hasWrongGuessForPosition(input.tierSessionId, input.position),
    ])
    if (solved) {
      throw new DescribeGuessError('POSITION_ALREADY_SOLVED', 'This screenshot is already solved', 409)
    }
    // There is no per-screenshot give-up in the game: the only way to have
    // "tried and failed" on a screenshot is a wrong title attempt.
    if (!triedTitle) {
      throw new DescribeGuessError(
        'DESCRIBE_NOT_ALLOWED_YET',
        'Try a title first',
        409
      )
    }

    const target = await deps.attempts.findTargetSheet(input.screenshotId)
    if (!target) {
      throw new DescribeGuessError('SCREENSHOT_NOT_FOUND', 'Screenshot not found', 404)
    }

    const attemptId = await deps.attempts.claim({
      userId: input.userId,
      isGuest: input.isGuest,
      gameSessionId: session.game_session_id,
      tierSessionId: input.tierSessionId,
      position: input.position,
      screenshotId: input.screenshotId,
      targetGameId: target.id,
      description,
      locale: input.locale,
      model: deps.judge.model,
    })
    if (attemptId === null) {
      throw new DescribeGuessError('ALREADY_DESCRIBED', 'This screenshot already has a description', 409)
    }

    const started = now()
    let evaluation: DescribeEvaluation
    try {
      const seriesName = deps.fuzzy.parseGameTitle(target.name).seriesName
      const pools = await deps.attempts.findCandidatePools(target, seriesName)
      const candidates = selectCandidates(target, pools, rng)
      evaluation = await evaluate({ description, locale: input.locale, target, candidates })
    } catch (error) {
      // Candidate lookup failed (DB blip). Still never break the game.
      log.error({ err: error instanceof Error ? error.message : String(error) }, 'describe-guess failed before judging')
      evaluation = {
        candidateGameIds: [target.id],
        chosenGameId: null,
        probability: null,
        accepted: null,
        titlePrefilterHit: false,
        model: deps.judge.model,
        latencyMs: Math.max(0, Math.round(now() - started)),
        inputTokens: null,
        outputTokens: null,
        error: 'unknown',
      }
    }

    // Judgement latency is free for the player: the server-side round clock
    // (speed multiplier of a later correct guess) moves forward by the time
    // spent here. The client pauses its countdown over the same request.
    const elapsed = Math.max(0, Math.round(now() - started))
    await Promise.all([
      deps.attempts.complete(attemptId, evaluation),
      deps.sessions.shiftRoundStart(input.tierSessionId, input.position, elapsed),
    ]).catch((error: unknown) => {
      log.error({ err: error instanceof Error ? error.message : String(error), attemptId }, 'describe-guess failed to store verdict')
    })

    log.info(
      {
        attemptId,
        userId: input.userId,
        position: input.position,
        accepted: evaluation.accepted,
        probability: evaluation.probability,
        titlePrefilterHit: evaluation.titlePrefilterHit,
        latencyMs: evaluation.latencyMs,
        error: evaluation.error,
      },
      'describe-guess recorded (shadow mode, no points)'
    )
    return evaluation
  }

  return { evaluate, submit }
}
