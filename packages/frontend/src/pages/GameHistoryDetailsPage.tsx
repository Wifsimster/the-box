import { useEffect, useMemo, useReducer } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { gameApi } from '@/lib/api/game'
import { getApiErrorMessage } from '@/lib/api-errors'
import type { GameSessionDetailsResponse } from '@/types'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'
import { SessionDetails } from '@/components/game/SessionDetails'
import { mergeSessionResults } from '@/lib/sessionResults'

interface DetailsState {
  sessionData: GameSessionDetailsResponse | null
  loading: boolean
  error: string | null
}

type DetailsAction =
  | { type: 'loaded'; sessionData: GameSessionDetailsResponse }
  | { type: 'failed'; error: string }

const initialDetails: DetailsState = {
  sessionData: null,
  loading: true,
  error: null,
}

function detailsReducer(state: DetailsState, action: DetailsAction): DetailsState {
  switch (action.type) {
    case 'loaded':
      return { sessionData: action.sessionData, loading: false, error: null }
    case 'failed':
      return { sessionData: null, loading: false, error: action.error }
    default:
      return state
  }
}

export default function GameHistoryDetailsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { sessionId } = useParams<{ sessionId: string }>()
  const [{ sessionData, loading, error }, dispatch] = useReducer(
    detailsReducer,
    initialDetails,
  )
  const reducedMotion = useReducedMotionSafe()

  useEffect(() => {
    if (!sessionId) {
      dispatch({ type: 'failed', error: t('apiErrors.INVALID_SESSION_ID') })
      return
    }

    gameApi.getGameSessionDetails(sessionId)
      .then(data => {
        dispatch({ type: 'loaded', sessionData: data })
      })
      .catch(err => {
        dispatch({ type: 'failed', error: getApiErrorMessage(err) })
      })
  }, [sessionId, t])

  const results = useMemo(
    () => (sessionData ? mergeSessionResults(sessionData) : []),
    [sessionData],
  )

  if (loading) {
    return (
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  if (error || !sessionData) {
    return (
      <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">{error || 'Session not found'}</p>
          <Button onClick={() => navigate(localizedPath('/history'))}>
            <ArrowLeft className="size-4 mr-2" />
            {t('common.back')}
          </Button>
        </div>
      </div>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className="container mx-auto p-3 sm:px-4 sm:py-6 md:px-6 md:py-8 max-w-4xl">
      {/* Back link — top-left, compact on mobile to free vertical space */}
      <div className="mb-3 sm:mb-4 md:mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-9 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(localizedPath('/history'))}
        >
          <ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />
          <span>{t('common.back')}</span>
        </Button>
      </div>

      <SessionDetails
        results={results}
        totalScore={sessionData.totalScore}
        totalScreenshots={sessionData.totalScreenshots}
        challengeDate={sessionData.challengeDate}
        isPersonalBest={sessionData.isPersonalBest}
        heroTitle={formatDate(sessionData.challengeDate)}
        zeroScore={{
          title: t('history.zeroScore.title'),
          subtitle: t('history.zeroScore.subtitle'),
        }}
        shareEnabled
        reducedMotion={reducedMotion}
      />
    </div>
  )
}
