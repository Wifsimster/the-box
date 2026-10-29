export const AGENT_KEY_PAUSE_MIN_SUBMISSIONS = 10
export const AGENT_KEY_PAUSE_REJECTION_RATIO = 0.6

export function shouldPauseAgentKey(counts: { submitted: number; rejected: number }): boolean {
  if (counts.submitted < AGENT_KEY_PAUSE_MIN_SUBMISSIONS) return false
  return counts.rejected / counts.submitted > AGENT_KEY_PAUSE_REJECTION_RATIO
}
