import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useFeatures } from '@/hooks/useFeatures'
import { useGameStore } from '@/stores/gameStore'
import { gameApi } from '@/lib/api/game'

const MIN_LENGTH = 15
const MAX_LENGTH = 200

/**
 * "Describe the game" — shadow mode (beta).
 *
 * After a wrong title attempt on a screenshot, a discreet text link lets the
 * player describe the game instead. One description per screenshot. It earns
 * no points: the server only records the description and the model verdict
 * to tune the feature later, and answers the same acknowledgement whatever
 * the verdict, so nothing here can reveal the answer.
 *
 * Never shown unless the server reports `describeGuess` (both
 * DESCRIBE_GUESS_ENABLED and ANTHROPIC_API_KEY set). It never takes focus on
 * its own, so the title flow keeps the same number of taps.
 *
 * The countdown is paused while the judge runs (store `pauseRoundTimer`),
 * and the server moves the round clock forward by the same wait.
 */
export function DescribeGameEntry() {
  const { features, position, positionState, tierSessionId, screenshotId, gamePhase } = useDescribeContext()
  // Remount per position so the form and its acknowledgement reset.
  if (!features.describeGuess || gamePhase !== 'playing' || !tierSessionId || !screenshotId) return null
  if (!positionState?.hasIncorrectGuess || positionState.status !== 'in_progress') return null
  return (
    <DescribeGameForm
      key={position}
      position={position}
      tierSessionId={tierSessionId}
      screenshotId={screenshotId}
      alreadySent={positionState.describeSubmitted === true}
    />
  )
}

function useDescribeContext() {
  const features = useFeatures()
  const position = useGameStore((s) => s.currentPosition)
  const positionState = useGameStore((s) => s.positionStates[s.currentPosition])
  const tierSessionId = useGameStore((s) => s.tierSessionId)
  const screenshotId = useGameStore((s) =>
    s.currentScreenshotData?.position === s.currentPosition ? s.currentScreenshotData.screenshotId : undefined
  )
  const gamePhase = useGameStore((s) => s.gamePhase)
  return { features, position, positionState, tierSessionId, screenshotId, gamePhase }
}

type Status = 'idle' | 'open' | 'sending' | 'sent' | 'error'

function DescribeGameForm({
  position,
  tierSessionId,
  screenshotId,
  alreadySent,
}: {
  position: number
  tierSessionId: string
  screenshotId: number
  alreadySent: boolean
}) {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState<Status>(alreadySent ? 'sent' : 'idle')
  const [text, setText] = useState('')
  const formId = useId()
  const hintId = useId()
  const counterId = useId()

  const pauseRoundTimer = useGameStore((s) => s.pauseRoundTimer)
  const resumeRoundTimer = useGameStore((s) => s.resumeRoundTimer)
  const markDescribeSubmitted = useGameStore((s) => s.markDescribeSubmitted)

  const length = text.trim().length
  const canSend = length >= MIN_LENGTH && length <= MAX_LENGTH && status !== 'sending'

  const submit = async () => {
    if (!canSend) return
    setStatus('sending')
    pauseRoundTimer()
    try {
      await gameApi.describeGame({
        tierSessionId,
        screenshotId,
        position,
        description: text.trim(),
        locale: i18n.language?.startsWith('en') ? 'en' : 'fr',
      })
      markDescribeSubmitted(position)
      setStatus('sent')
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'ALREADY_DESCRIBED') {
        markDescribeSubmitted(position)
        setStatus('sent')
      } else {
        setStatus('error')
      }
    } finally {
      resumeRoundTimer()
    }
  }

  if (status === 'sent') {
    return (
      <p
        role="status"
        className="px-1 text-center text-xs sm:text-sm text-muted-foreground"
        data-testid="describe-game-ack"
      >
        {t('game.describe.ack')}
      </p>
    )
  }

  if (status === 'idle') {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setStatus('open')}
          aria-expanded={false}
          data-testid="describe-game-open"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-xs sm:text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
        >
          <MessageSquareText className="size-4 shrink-0" aria-hidden="true" />
          <span>{t('game.describe.entry')}</span>
          <Badge variant="info" className="px-1.5 py-0 text-[10px] uppercase tracking-wide">
            {t('game.describe.beta')}
          </Badge>
        </button>
      </div>
    )
  }

  return (
    <form
      id={formId}
      aria-label={t('game.describe.formLabel')}
      data-testid="describe-game-form"
      className="space-y-2 rounded-xl border border-border/60 bg-background/70 p-2.5 sm:p-3 backdrop-blur-md"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={`${formId}-text`} className="text-sm font-medium text-foreground">
          {t('game.describe.label')}
        </label>
        <Badge variant="info" className="px-1.5 py-0 text-[10px] uppercase tracking-wide">
          {t('game.describe.beta')}
        </Badge>
      </div>
      <Textarea
        id={`${formId}-text`}
        value={text}
        onChange={(e) => {
          setText(e.target.value.slice(0, MAX_LENGTH))
          if (status === 'error') setStatus('open')
        }}
        maxLength={MAX_LENGTH}
        rows={2}
        placeholder={t('game.describe.placeholder')}
        aria-describedby={`${hintId} ${counterId}`}
        // Rendered only after the player tapped the entry: focus is the next step.
        autoFocus
        autoComplete="off"
        enterKeyHint="send"
        className="min-h-16 resize-none bg-card/80"
        disabled={status === 'sending'}
      />
      <p id={hintId} className="text-xs text-muted-foreground">
        {t('game.describe.hint')}
      </p>
      {status === 'error' && (
        <p role="alert" className="text-xs text-error">
          {t('game.describe.error')}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span id={counterId} className="text-xs tabular-nums text-muted-foreground">
          {length < MIN_LENGTH
            ? t('game.describe.tooShort', { count: MIN_LENGTH - length })
            : t('game.describe.counter', { count: length, max: MAX_LENGTH })}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() => setStatus('idle')}
            disabled={status === 'sending'}
          >
            {t('game.describe.cancel')}
          </Button>
          <Button type="submit" size="sm" className="min-h-11" disabled={!canSend} data-testid="describe-game-submit">
            {status === 'sending' ? t('game.describe.sending') : t('game.describe.submit')}
          </Button>
        </div>
      </div>
    </form>
  )
}
