/**
 * Port for the "describe the game" judge (shadow mode).
 *
 * The domain hands the judge a player description and an ordered list of
 * candidate game sheets, each behind an opaque label. The judge returns the
 * raw structured output; parsing and the verdict stay in the domain
 * (describe-guess.service.ts) so they are unit-tested without the SDK.
 *
 * Implemented in infrastructure/llm/anthropic-describe-judge.ts.
 */

/** Game sheet built from existing `games` columns only. */
export interface DescribeGameSheet {
  id: number
  name: string
  aliases: string[]
  releaseYear: number | null
  developer: string | null
  publisher: string | null
  genres: string[]
  platforms: string[]
}

export interface DescribeJudgeCandidate {
  /** Opaque label the model answers with ("c01"…). Never the game id. */
  label: string
  sheet: DescribeGameSheet
}

export interface DescribeJudgeInput {
  description: string
  locale: string
  candidates: DescribeJudgeCandidate[]
}

export interface DescribeJudgeOutput {
  /** Parsed JSON body, not yet validated. */
  raw: unknown
  inputTokens: number | null
  outputTokens: number | null
}

/**
 * Short, stable failure codes. Stored in `describe_guess_attempts.error`,
 * so keep them under 64 characters.
 */
export type DescribeJudgeErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'connection'
  | 'refusal'
  | 'max_tokens'
  | 'invalid_output'
  | 'api_error'
  | 'unknown'

export class DescribeJudgeError extends Error {
  constructor(
    public readonly code: DescribeJudgeErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'DescribeJudgeError'
  }
}

export interface DescribeJudge {
  /** Model id recorded with every verdict. */
  readonly model: string
  judge(input: DescribeJudgeInput, signal: AbortSignal): Promise<DescribeJudgeOutput>
}
