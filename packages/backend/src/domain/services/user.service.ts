import { sessionRepository } from '../../infrastructure/repositories/index.js'
import type { GameHistoryResponse } from '@the-box/types'

export const userService = {
  async getGameHistory(userId: string): Promise<GameHistoryResponse> {
    const entries = await sessionRepository.findUserGameHistory(userId)

    return {
      entries: entries.map(entry => ({
        sessionId: entry.session_id,
        challengeDate: entry.challenge_date,
        totalScore: entry.total_score,
        isCompleted: entry.is_completed,
        completedAt: entry.completed_at?.toISOString() ?? null,
      })),
    }
  },
}
