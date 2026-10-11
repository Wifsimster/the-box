/**
 * Deterministic stand-in for the describe-guess judge. It never calls a
 * network: it gives the first candidate 0.6 and spreads the rest evenly,
 * optionally after a fixed delay.
 *
 * Only selected through `DESCRIBE_GUESS_JUDGE=stub` outside production (see
 * composition/describe-guess.ts), so e2e runs and local development can
 * exercise the whole flow without an API key or a paid call.
 */
import type {
  DescribeJudge,
  DescribeJudgeInput,
  DescribeJudgeOutput,
} from '../../domain/ports/describe-judge.js'

export const STUB_DESCRIBE_JUDGE_MODEL = 'stub'

export function createStubDescribeJudge(opts: { delayMs?: number } = {}): DescribeJudge {
  const delayMs = Math.max(0, opts.delayMs ?? 0)
  return {
    model: STUB_DESCRIBE_JUDGE_MODEL,
    async judge(input: DescribeJudgeInput): Promise<DescribeJudgeOutput> {
      // Optional latency (DESCRIBE_GUESS_STUB_DELAY_MS) so e2e can show a slow
      // judge never slows the guess response. Kept under the 5 s deadline.
      if (delayMs > 0) await new Promise((r) => setTimeout(r, Math.min(delayMs, 4000)))
      const labels = input.candidates.map((c) => c.label)
      const rest = labels.length > 1 ? 0.4 / (labels.length - 1) : 0
      const probabilities = Object.fromEntries(
        labels.map((label, i) => [label, i === 0 ? 0.6 : rest])
      )
      return {
        raw: { game_id: labels[0], probabilities },
        inputTokens: 0,
        outputTokens: 0,
      }
    },
  }
}
