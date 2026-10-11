/**
 * Composition root for "describe the game" (shadow mode).
 *
 * Configuration comes from the app-settings store (Admin → Paramètres or the
 * settings MCP tools): describeGuess.enabled, .anthropicApiKey, .model,
 * .threshold. The feature is live only when enabled AND a key is set; nothing
 * Anthropic-related is constructed otherwise. The service is rebuilt whenever
 * the key, model or threshold changes (settings reads are cached, so this is
 * cheap per request).
 */
import { env } from '../config/env.js'
import {
  createDescribeGuessService,
  isDescribeGuessActive,
  readDescribeGuessConfig,
  type DescribeGuessConfig,
  type DescribeGuessService,
} from '../domain/services/describe-guess.service.js'
import { createFuzzyMatchService } from '../domain/services/fuzzy-match.service.js'
import type { DescribeJudge } from '../domain/ports/describe-judge.js'
import { createAnthropicDescribeJudge } from '../infrastructure/llm/anthropic-describe-judge.js'
import { createStubDescribeJudge } from '../infrastructure/llm/stub-describe-judge.js'
import { serviceLogger } from '../infrastructure/logger/logger.js'
import {
  challengeRepository,
  describeGuessRepository,
  sessionRepository,
} from '../infrastructure/repositories/index.js'
import { appSettingsService } from './app-settings.js'

export function readDescribeGuessSettings(): Promise<DescribeGuessConfig> {
  return readDescribeGuessConfig((key) => appSettingsService.getValue(key))
}

/** Same rule as the route gate, for /api/features. */
export async function isDescribeGuessLive(): Promise<boolean> {
  return isDescribeGuessActive(await readDescribeGuessSettings())
}

function createJudge(config: DescribeGuessConfig & { apiKey: string }): DescribeJudge {
  // Test/dev hook: a deterministic judge with no network call. Refused in
  // production so a stray env var can never disable the real judge there.
  if (env.DESCRIBE_GUESS_JUDGE === 'stub' && env.NODE_ENV !== 'production') {
    serviceLogger.warn('describe-guess: using the STUB judge (DESCRIBE_GUESS_JUDGE=stub)')
    return createStubDescribeJudge()
  }
  return createAnthropicDescribeJudge({ apiKey: config.apiKey, model: config.model })
}

const fuzzy = createFuzzyMatchService({ logger: serviceLogger })
let built: { config: DescribeGuessConfig; service: DescribeGuessService } | null = null

function sameConfig(a: DescribeGuessConfig, b: DescribeGuessConfig): boolean {
  return a.apiKey === b.apiKey && a.model === b.model && a.threshold === b.threshold
}

/** The service for the current settings, or null when the feature is off. */
export async function getDescribeGuessService(): Promise<DescribeGuessService | null> {
  const config = await readDescribeGuessSettings()
  if (!isDescribeGuessActive(config) || config.apiKey === null) return null
  if (!built || !sameConfig(built.config, config)) {
    built = {
      config,
      service: createDescribeGuessService({
        judge: createJudge({ ...config, apiKey: config.apiKey }),
        fuzzy,
        sessions: sessionRepository,
        challenges: challengeRepository,
        attempts: describeGuessRepository,
        logger: serviceLogger,
        threshold: config.threshold,
      }),
    }
  }
  return built.service
}
