import type {
  TodayChallengeResponse,
  StartChallengeResponse,
  ScreenshotResponse,
  GuessResponse,
  RevealLetterResponse,
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
  async getTodayChallenge(date?: string): Promise<TodayChallengeResponse> {
    const url = date 
      ? `/api/game/today?date=${encodeURIComponent(date)}`
      : '/api/game/today'
    const response = await fetch(url, {
      credentials: 'include',
    })
    return handleResponse<TodayChallengeResponse>(response)
  },

  async startChallenge(challengeId: number): Promise<StartChallengeResponse> {
    const response = await fetch(`/api/game/start/${challengeId}`, {
      method: 'POST',
      credentials: 'include',
    })
    return handleResponse<StartChallengeResponse>(response)
  },

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

  async searchGames(query: string): Promise<GameSearchResult[]> {
    if (query.length < 2) return []

    const params = new URLSearchParams({ q: query })
    const response = await fetch(`/api/game/games/search?${params}`, {
      credentials: 'include',
    })
    const data = await handleResponse<{ games: GameSearchResult[] }>(response)
    return data.games
  },

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

  async revealLetter(params: {
    tierSessionId: string
    position: number
  }): Promise<RevealLetterResponse> {
    const response = await fetch('/api/game/reveal-letter', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    return handleResponse<RevealLetterResponse>(response)
  },

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

  async getGameHistory(): Promise<GameHistoryResponse> {
    const response = await fetch('/api/user/history', {
      credentials: 'include',
    })
    return handleResponse<GameHistoryResponse>(response)
  },

  async getGameSessionDetails(sessionId: string): Promise<GameSessionDetailsResponse> {
    const response = await fetch(`/api/user/history/${sessionId}`, {
      credentials: 'include',
    })
    return handleResponse<GameSessionDetailsResponse>(response)
  },

  async getPreview(): Promise<{ challengeDate: string; imageUrl: string }> {
    const response = await fetch('/api/game/preview')
    return handleResponse<{ challengeDate: string; imageUrl: string }>(response)
  },
}

export { GameApiError }
