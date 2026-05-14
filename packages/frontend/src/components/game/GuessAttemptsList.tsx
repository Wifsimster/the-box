import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { GuessAttempt } from '@the-box/types'

interface GuessAttemptsListProps {
  attempts: GuessAttempt[]
  /** Smaller variant used inside mobile result rows. */
  compact?: boolean
}

export function GuessAttemptsList({ attempts, compact = false }: GuessAttemptsListProps) {
  const { t } = useTranslation()

  if (!attempts || attempts.length === 0) {
    return null
  }

  const textSize = compact ? 'text-[10px]' : 'text-xs'
  const padding = compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
  const iconSize = compact ? 'w-2.5 h-2.5' : 'w-3 h-3'

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className={`${textSize} text-muted-foreground mr-1`}>
        {t('game.attempts.label')}:
      </span>
      {attempts.map((attempt, index) => {
        const display = attempt.guess?.trim() || '—'
        const isCorrect = attempt.isCorrect
        return (
          <span
            key={`${index}-${display}`}
            className={`inline-flex max-w-full items-center gap-1 rounded-full border ${padding} ${textSize} font-medium ${
              isCorrect
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-destructive/40 bg-destructive/10 text-destructive line-through decoration-destructive/50'
            }`}
          >
            {isCorrect ? (
              <CheckCircle2 className={`${iconSize} shrink-0`} aria-hidden="true" />
            ) : (
              <XCircle className={`${iconSize} shrink-0`} aria-hidden="true" />
            )}
            <span className="min-w-0 break-words">{display}</span>
          </span>
        )
      })}
    </div>
  )
}
