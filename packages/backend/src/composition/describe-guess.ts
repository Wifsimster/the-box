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
import { describeCatalogue, describeGuessRepository } from '../infrastructure/repositories/index.js'
import { appSettingsService } from './app-settings.js'

export function readDescribeGuessSettings(): Promise<DescribeGuessConfig> {
  return readDescribeGuessConfig((key) => appSettingsService.getValue(key))
}

export async function isDescribeGuessLive(): Promise<boolean> {
  return isDescribeGuessActive(await readDescribeGuessSettings())
}

function createJudge(config: DescribeGuessConfig & { apiKey: string }): DescribeJudge {
  if (env.DESCRIBE_GUESS_JUDGE === 'stub' && env.NODE_ENV !== 'production') {
    serviceLogger.warn('describe-guess: using the STUB judge (DESCRIBE_GUESS_JUDGE=stub)')
    return createStubDescribeJudge({ delayMs: env.DESCRIBE_GUESS_STUB_DELAY_MS })
  }
  return createAnthropicDescribeJudge({ apiKey: config.apiKey, model: config.model })
}

const fuzzy = createFuzzyMatchService({ logger: serviceLogger })
let built: { config: DescribeGuessConfig; service: DescribeGuessService } | null = null

function sameConfig(a: DescribeGuessConfig, b: DescribeGuessConfig): boolean {
  return a.apiKey === b.apiKey && a.model === b.model && a.threshold === b.threshold
}

export async function getDescribeGuessService(): Promise<DescribeGuessService | null> {
  const config = await readDescribeGuessSettings()
  if (!isDescribeGuessActive(config) || config.apiKey === null) return null
  if (!built || !sameConfig(built.config, config)) {
    built = {
      config,
      service: createDescribeGuessService({
        judge: createJudge({ ...config, apiKey: config.apiKey }),
        fuzzy,
        attempts: describeGuessRepository,
        catalogue: describeCatalogue,
        logger: serviceLogger,
        threshold: config.threshold,
      }),
    }
  }
  return built.service
}
