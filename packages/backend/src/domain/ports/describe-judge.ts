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
  label: string
  sheet: DescribeGameSheet
}

export interface DescribeJudgeInput {
  description: string
  locale: string
  candidates: DescribeJudgeCandidate[]
}

export interface DescribeJudgeOutput {
  raw: unknown
  inputTokens: number | null
  outputTokens: number | null
}

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
  readonly model: string
  judge(input: DescribeJudgeInput, signal: AbortSignal): Promise<DescribeJudgeOutput>
}
