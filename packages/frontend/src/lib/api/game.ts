import type {
  TodayChallengeResponse,
  StartChallengeResponse,
  ScreenshotResponse,
  GuessResponse,
  EndGameResponse,
  GameSearchResult,
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
   * Get today's challenge information
   */
  async getTodayChallenge(): Promise<TodayChallengeResponse> {
    const response = await fetch('/api/game/today', {
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
   * Get screenshot for current position
   */
  async getScreenshot(sessionId: string, position: number): Promise<ScreenshotResponse> {
    const params = new URLSearchParams({
      sessionId,
      position: position.toString(),
    })
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
}

export { GameApiError }
