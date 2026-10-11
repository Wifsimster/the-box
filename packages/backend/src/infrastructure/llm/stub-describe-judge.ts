/**
 * Deterministic stand-in for the describe-guess judge. It never calls a
 * network: it gives the first candidate 0.6 and spreads the rest evenly.
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

export function createStubDescribeJudge(): DescribeJudge {
  return {
    model: STUB_DESCRIBE_JUDGE_MODEL,
    async judge(input: DescribeJudgeInput): Promise<DescribeJudgeOutput> {
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
