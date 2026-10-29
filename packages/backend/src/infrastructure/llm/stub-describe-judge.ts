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
