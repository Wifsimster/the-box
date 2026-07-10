// Per-key anti-abuse for the agent propose surface (issue #331, phase 5).
//
// Mirrors the human contributor shadow-ban (geo-reward.service): a geo-agent
// key whose recent proposals are mostly rejected by consensus is auto-paused,
// so a miscalibrated proposer can't keep flooding the review queue with noise.
// Pure so the threshold logic is unit-tested without a DB; the route pairs it
// with `geoPinRepository.agentKeyRejectionRatio7d`.

// Same bar as the human shadow-ban, deliberately: SHADOW_BAN_MIN_SUBMISSIONS /
// SHADOW_BAN_REJECTION_RATIO in geo-reward.service. Kept as its own constants
// so the two policies can diverge later without a surprising coupling.
export const AGENT_KEY_PAUSE_MIN_SUBMISSIONS = 10
export const AGENT_KEY_PAUSE_REJECTION_RATIO = 0.6

/**
 * True when a key's 7-day proposals should be paused: enough submissions to
 * judge (≥ min) AND a rejection ratio above the bar. Below the min-submissions
 * floor a key is always allowed — we don't punish a key on a tiny sample.
 */
export function shouldPauseAgentKey(counts: { submitted: number; rejected: number }): boolean {
  if (counts.submitted < AGENT_KEY_PAUSE_MIN_SUBMISSIONS) return false
  return counts.rejected / counts.submitted > AGENT_KEY_PAUSE_REJECTION_RATIO
}
