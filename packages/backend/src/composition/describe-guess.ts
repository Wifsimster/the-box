/**
 * Composition root for "describe the game" (shadow mode).
 *
 * Kept out of `services.ts` so the route can import it without pulling the
 * BullMQ queues, and so nothing Anthropic-related is constructed unless the
 * feature is enabled (DESCRIBE_GUESS_ENABLED=true AND ANTHROPIC_API_KEY set).
 */
import { env, isDescribeGuessEnabled } from '../config/env.js'
import {
  createDescribeGuessService,
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

function createJudge(): DescribeJudge {
  if (env.DESCRIBE_GUESS_JUDGE === 'stub' && env.NODE_ENV !== 'production') {
    serviceLogger.warn('describe-guess: using the STUB judge (DESCRIBE_GUESS_JUDGE=stub)')
    return createStubDescribeJudge()
  }
  return createAnthropicDescribeJudge({ apiKey: env.ANTHROPIC_API_KEY })
}

let service: DescribeGuessService | null = null

/** The service, or null when the feature is off. Built on first use. */
export function getDescribeGuessService(): DescribeGuessService | null {
  if (!isDescribeGuessEnabled()) return null
  if (!service) {
    service = createDescribeGuessService({
      judge: createJudge(),
      fuzzy: createFuzzyMatchService({ logger: serviceLogger }),
      sessions: sessionRepository,
      challenges: challengeRepository,
      attempts: describeGuessRepository,
      logger: serviceLogger,
    })
  }
  return service
}
