import type {
  TodayChallengeResponse,
  StartChallengeResponse,
  ScreenshotResponse,
  GuessResponse,
  EndGameResponse,
  GameSearchResult,
  GameHistoryResponse,
  GameSessionDetailsResponse,
} from '@/types'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

class GameApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'GameApiError'
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json()

  if (!json.success || !json.data) {
    throw new GameApiError(
      json.error?.code || 'UNKNOWN_ERROR',
      json.error?.message || 'An unexpected error occurred'
    )
  }

  return json.data
}

export const gameApi = {
  /**
   * Get today's challenge information (or challenge by date if provided)
   */
  async getTodayChallenge(date?: string): Promise<TodayChallengeResponse> {
    const url = date 
      ? `/api/game/today?date=${encodeURIComponent(date)}`
      : '/api/game/today'
    const response = await fetch(url, {
      credentials: 'include',
    })
    return handleResponse<TodayChallengeResponse>(response)
  },

  /**
   * Start a challenge session
   */
  async startChallenge(challengeId: number): Promise<StartChallengeResponse> {
    const response = await fetch(`/api/game/start/${challengeId}`, {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<StartChallengeResponse>(response)
  },

  /**
   * Get screenshot for a position.
   *
   * Pass `prefetch: true` for carousel warming / background preloading.
   * The server otherwise stamps the round timer onto this position, and
   * a subsequent submitGuess on a different position will 409 with
   * `ROUND_NOT_STARTED`.
   */
  async getScreenshot(
    sessionId: string,
    position: number,
    options: { prefetch?: boolean } = {}
  ): Promise<ScreenshotResponse> {
    const params = new URLSearchParams({
      sessionId,
      position: position.toString(),
    })
    if (options.prefetch) {
      params.set('prefetch', '1')
    }
    const response = await fetch(`/api/game/screenshot?${params}`, {
      credentials: 'include',
    })
    return handleResponse<ScreenshotResponse>(response)
  },

  /**
   * Submit a guess
   */
  async submitGuess(params: {
    tierSessionId: string
    screenshotId: number
    position: number
    gameId: number | null
    guessText: string
    timeTakenMs: number
  }): Promise<GuessResponse> {
    const response = await fetch('/api/game/guess', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    return handleResponse<GuessResponse>(response)
  },

  /**
   * Search games for autocomplete
   */
  async searchGames(query: string): Promise<GameSearchResult[]> {
    if (query.length < 2) return []

    const params = new URLSearchParams({ q: query })
    const response = await fetch(`/api/game/games/search?${params}`, {
      credentials: 'include',
    })
    const data = await handleResponse<{ games: GameSearchResult[] }>(response)
    return data.games
  },

  /**
   * Activate the `second_chance` powerup for a specific position. The
   * server decrements inventory and records the activation atomically.
   * The next correct guess on this (tierSession, position) will have
   * its score floor clamped to 70 — see backend game.service for the
   * canonical contract.
   */
  async activateSecondChance(params: {
    tierSessionId: string
    position: number
  }): Promise<{ activated: true }> {
    const response = await fetch('/api/game/second-chance', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    return handleResponse<{ activated: true }>(response)
  },

  /**
   * End game early (forfeit)
   */
  async endGame(sessionId: string): Promise<EndGameResponse> {
    const response = await fetch('/api/game/end', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    })
    return handleResponse<EndGameResponse>(response)
  },

  /**
   * Get user's daily game history
   */
  async getGameHistory(): Promise<GameHistoryResponse> {
    const response = await fetch('/api/user/history', {
      credentials: 'include',
    })
    return handleResponse<GameHistoryResponse>(response)
  },

  /**
   * Get detailed game session information
   */
  async getGameSessionDetails(sessionId: string): Promise<GameSessionDetailsResponse> {
    const response = await fetch(`/api/user/history/${sessionId}`, {
      credentials: 'include',
    })
    return handleResponse<GameSessionDetailsResponse>(response)
  },

  /**
   * Public preview: metadata for today's first screenshot so anonymous
   * visitors can see the challenge before signing up.
   */
  async getPreview(): Promise<{ challengeDate: string; imageUrl: string }> {
    const response = await fetch('/api/game/preview')
    return handleResponse<{ challengeDate: string; imageUrl: string }>(response)
  },
}

export { GameApiError }
