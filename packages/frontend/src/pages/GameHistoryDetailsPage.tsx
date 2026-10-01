import { useEffect, useMemo, useReducer } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, SearchX } from 'lucide-react'
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

  const goBack = () => navigate(localizedPath('/history'))
  const containerClass = 'container mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6 md:py-8'

  if (loading) {
    return (
      <div className={containerClass} aria-busy="true">
        <span className="sr-only" role="status">{t('common.loading')}</span>
        <Skeleton className="mb-4 h-11 w-24" />
        <Skeleton className="mb-4 h-40 w-full rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !sessionData) {
    return (
      <div className={containerClass}>
        <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-sm text-sm sm:text-base text-muted-foreground">
            {error || t('apiErrors.SESSION_NOT_FOUND')}
          </p>
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft aria-hidden="true" />
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
    <div className={containerClass}>
      <div className="mb-3 sm:mb-4">
        <Button
          variant="ghost"
          className="-ml-3 px-3 text-muted-foreground hover:text-foreground"
          onClick={goBack}
        >
          <ArrowLeft aria-hidden="true" />
          {t('common.back')}
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
