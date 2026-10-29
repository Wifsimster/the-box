import type { DomainLogger } from '../ports/logger.js'
import {
  DescribeJudgeError,
  type DescribeGameSheet,
  type DescribeJudge,
  type DescribeJudgeCandidate,
  type DescribeJudgeErrorCode,
} from '../ports/describe-judge.js'
import type { FuzzyMatchService } from './fuzzy-match.service.js'

export const DESCRIBE_ACCEPT_THRESHOLD = 0.8
export const DESCRIBE_DEFAULT_MODEL = 'claude-haiku-5-5'
export const DESCRIBE_MIN_LENGTH = 15
export const DESCRIBE_MIN_WORDS = 2
export const DESCRIBE_MAX_LENGTH = 200
export const DESCRIBE_CAPTURES_PER_HOUR = 20
export const DESCRIBE_DISTRACTOR_COUNT = 10
export const DESCRIBE_SAME_SERIES_MAX = 2
export const DESCRIBE_RELATED_MAX = 4
export const DESCRIBE_JUDGE_TIMEOUT_MS = 5000
export const DESCRIBE_LOCALES = ['fr', 'en'] as const
export type DescribeLocale = (typeof DESCRIBE_LOCALES)[number]

const PREFILTER_MAX_WINDOW = 6

export interface CandidatePools {
  sameSeries: DescribeGameSheet[]
  sameGenre: DescribeGameSheet[]
  random: DescribeGameSheet[]
}

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
  take([...pools.sameSeries, ...pools.sameGenre], distractorCount - picked.length)

  return shuffle([target, ...picked], rng)
}

export function titlePrefilterHit(
  description: string,
  candidates: readonly DescribeGameSheet[],
  fuzzy: Pick<FuzzyMatchService, 'isMatch'>
): boolean {
  const words = description.split(/[\s'’]+/).filter(Boolean)
  const initials = words.map((w) => nameKey(w).charAt(0))

  for (const candidate of candidates) {
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

export interface ParsedVerdict {
  chosenLabel: string
  probability: number
}

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

export function isAccepted(
  chosenGameId: number | null,
  probability: number | null,
  targetGameId: number,
  threshold: number = DESCRIBE_ACCEPT_THRESHOLD
): boolean | null {
  if (chosenGameId === null || probability === null) return null
  return chosenGameId === targetGameId && probability >= threshold
}

export interface DescribeGuessConfig {
  enabled: boolean
  apiKey: string | null
  model: string
  threshold: number
}

export type SettingReader = (
  key: 'describeGuess.enabled' | 'describeGuess.anthropicApiKey' | 'describeGuess.model' | 'describeGuess.threshold'
) => Promise<boolean | string | number | null>

export async function readDescribeGuessConfig(read: SettingReader): Promise<DescribeGuessConfig> {
  const [enabled, apiKey, model, threshold] = await Promise.all([
    read('describeGuess.enabled'),
    read('describeGuess.anthropicApiKey'),
    read('describeGuess.model'),
    read('describeGuess.threshold'),
  ])
  return {
    enabled: enabled === true,
    apiKey: typeof apiKey === 'string' && apiKey.trim() !== '' ? apiKey : null,
    model: typeof model === 'string' && model !== '' ? model : DESCRIBE_DEFAULT_MODEL,
    threshold: typeof threshold === 'number' ? threshold : DESCRIBE_ACCEPT_THRESHOLD,
  }
}

export function isDescribeGuessActive(config: Pick<DescribeGuessConfig, 'enabled' | 'apiKey'>): boolean {
  return config.enabled && config.apiKey !== null
}

export function candidateLabel(index: number): string {
  return `c${String(index + 1).padStart(2, '0')}`
}

export interface DescribeEvaluation {
  candidateGameIds: number[]
  chosenGameId: number | null
  probability: number | null
  accepted: boolean | null
  threshold: number
  titlePrefilterHit: boolean
  model: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  error: DescribeJudgeErrorCode | null
}

export function normalizeGuess(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function wordsOf(text: string): string[] {
  return text.split(/[\s'’]+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
}

export function hasDescriptionShape(text: string): boolean {
  const normalized = normalizeGuess(text)
  if (normalized.length < DESCRIBE_MIN_LENGTH || normalized.length > DESCRIBE_MAX_LENGTH) return false
  return wordsOf(normalized).length >= DESCRIBE_MIN_WORDS
}

export interface CatalogueTitle {
  id: number
  name: string
  aliases: string[]
}

export function matchesCatalogueTitle(
  text: string,
  catalogue: readonly CatalogueTitle[],
  fuzzy: Pick<FuzzyMatchService, 'evaluateMatch'>
): boolean {
  const tokens = new Set(wordsOf(normalizeGuess(text)).map(tokenKey))
  for (const game of catalogue) {
    if (!sharesToken(game, tokens)) continue
    if (fuzzy.evaluateMatch(text, game.name, game.aliases).matched) return true
  }
  return false
}

function tokenKey(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function sharesToken(game: CatalogueTitle, tokens: Set<string>): boolean {
  for (const form of [game.name, ...game.aliases]) {
    const words = wordsOf(form).map(tokenKey).filter(Boolean)
    if (words.some((w) => w.length >= 3 && tokens.has(w))) return true
    const initials = words.map((w) => w[0]).join('')
    if (initials.length >= 2 && tokens.has(initials)) return true
  }
  return false
}

export function createWindowLimiter(opts: { max: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return {
    tryTake(key: string): boolean {
      const t = now()
      const bucket = buckets.get(key)
      if (!bucket || bucket.resetAt <= t) {
        if (buckets.size > 10_000) {
          for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k)
        }
        buckets.set(key, { count: 1, resetAt: t + opts.windowMs })
        return true
      }
      if (bucket.count >= opts.max) return false
      bucket.count++
      return true
    },
  }
}

export interface DescriptionCaptureJob {
  userId: string
  isGuest: boolean
  tierSessionId: string
  position: number
  screenshotId: number
  guessText: string
  locale: DescribeLocale
}

export interface DescribeClaim {
  userId: string
  isGuest: boolean
  tierSessionId: string
  position: number
  screenshotId: number
  targetGameId: number
  guessText: string
  description: string
  locale: DescribeLocale
  model: string
}

export interface DescribeAttemptPort {
  findTargetSheet(screenshotId: number): Promise<DescribeGameSheet | null>
  findCandidatePools(target: DescribeGameSheet, seriesName: string | null): Promise<CandidatePools>
  claim(claim: DescribeClaim): Promise<number | null>
  complete(id: number, evaluation: DescribeEvaluation): Promise<void>
}

export interface CataloguePort {
  listTitles(): Promise<CatalogueTitle[]>
}

export interface DescribeGuessServiceDeps {
  judge: DescribeJudge
  fuzzy: Pick<FuzzyMatchService, 'isMatch' | 'evaluateMatch' | 'parseGameTitle'>
  attempts: DescribeAttemptPort
  catalogue: CataloguePort
  logger: DomainLogger
  rng?: Rng
  now?: () => number
  timeoutMs?: number
  threshold?: number
}

export type CaptureOutcome =
  | { status: 'skipped'; reason: 'shape' | 'title_like' | 'no_target' | 'already_captured' }
  | { status: 'recorded'; attemptId: number; evaluation: DescribeEvaluation }

export interface DescribeGuessService {
  evaluate(input: {
    description: string
    locale: DescribeLocale
    target: DescribeGameSheet
    candidates: DescribeGameSheet[]
  }): Promise<DescribeEvaluation>
  capture(job: DescriptionCaptureJob): Promise<CaptureOutcome>
}

export function createDescribeGuessService(deps: DescribeGuessServiceDeps): DescribeGuessService {
  const log = deps.logger.child({ service: 'describe-guess' })
  const rng = deps.rng ?? Math.random
  const now = deps.now ?? Date.now
  const timeoutMs = deps.timeoutMs ?? DESCRIBE_JUDGE_TIMEOUT_MS
  const threshold = deps.threshold ?? DESCRIBE_ACCEPT_THRESHOLD

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
      threshold,
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
      base.accepted = isAccepted(chosen.sheet.id, verdict.probability, target.id, threshold)
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

  async function capture(job: DescriptionCaptureJob): Promise<CaptureOutcome> {
    const description = normalizeGuess(job.guessText)
    if (!hasDescriptionShape(description)) return { status: 'skipped', reason: 'shape' }

    if (matchesCatalogueTitle(description, await deps.catalogue.listTitles(), deps.fuzzy)) {
      return { status: 'skipped', reason: 'title_like' }
    }

    const target = await deps.attempts.findTargetSheet(job.screenshotId)
    if (!target) return { status: 'skipped', reason: 'no_target' }

    const attemptId = await deps.attempts.claim({
      userId: job.userId,
      isGuest: job.isGuest,
      tierSessionId: job.tierSessionId,
      position: job.position,
      screenshotId: job.screenshotId,
      targetGameId: target.id,
      guessText: job.guessText.slice(0, DESCRIBE_MAX_LENGTH),
      description,
      locale: job.locale,
      model: deps.judge.model,
    })
    if (attemptId === null) return { status: 'skipped', reason: 'already_captured' }

    let evaluation: DescribeEvaluation
    const started = now()
    try {
      const seriesName = deps.fuzzy.parseGameTitle(target.name).seriesName
      const pools = await deps.attempts.findCandidatePools(target, seriesName)
      const candidates = selectCandidates(target, pools, rng)
      evaluation = await evaluate({ description, locale: job.locale, target, candidates })
    } catch (error) {
      log.error({ err: error instanceof Error ? error.message : String(error) }, 'describe-guess failed before judging')
      evaluation = {
        candidateGameIds: [target.id],
        chosenGameId: null,
        probability: null,
        accepted: null,
        threshold,
        titlePrefilterHit: false,
        model: deps.judge.model,
        latencyMs: Math.max(0, Math.round(now() - started)),
        inputTokens: null,
        outputTokens: null,
        error: 'unknown',
      }
    }

    await deps.attempts.complete(attemptId, evaluation)
    log.info(
      {
        attemptId,
        userId: job.userId,
        position: job.position,
        accepted: evaluation.accepted,
        probability: evaluation.probability,
        titlePrefilterHit: evaluation.titlePrefilterHit,
        latencyMs: evaluation.latencyMs,
        error: evaluation.error,
      },
      'describe-guess captured (shadow mode, no points)'
    )
    return { status: 'recorded', attemptId, evaluation }
  }

  return { evaluate, capture }
}

export type CaptureGateResult = 'enqueued' | 'skipped:shape' | 'skipped:off' | 'skipped:rate'

export interface CaptureGateDeps {
  isActive: () => Promise<boolean>
  enqueue: (job: DescriptionCaptureJob) => Promise<void>
  limiter: { tryTake(key: string): boolean }
}

export function createCaptureGate(deps: CaptureGateDeps) {
  return async function maybeCapture(job: DescriptionCaptureJob): Promise<CaptureGateResult> {
    if (!hasDescriptionShape(job.guessText)) return 'skipped:shape'
    if (!(await deps.isActive())) return 'skipped:off'
    if (!deps.limiter.tryTake(job.userId)) return 'skipped:rate'
    await deps.enqueue(job)
    return 'enqueued'
  }
}
