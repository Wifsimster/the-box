import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Flame } from 'lucide-react'
import type { GuessProximityHint } from '@the-box/types'
import { useReducedMotionSafe } from '@/hooks/useReducedMotionSafe'

const RELATION_KEY: Record<GuessProximityHint['relation'], string> = {
  same_franchise: 'game.proximity.sameFranchise',
  same_developer: 'game.proximity.sameDeveloper',
  same_publisher: 'game.proximity.samePublisher',
}

/**
 * "Warmer" banner shown under the guess input after a wrong guess that the
 * server could relate to the answer (same franchise / studio / publisher). It
 * teaches the player something from a near-miss without ever revealing the
 * answer's title — `hint.value` is an attribute of the game they named.
 */
export function ProximityHintBanner({ hint }: { hint: GuessProximityHint }) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotionSafe()

  return (
    <m.div
      // `aria-live` so the clue is announced; matches the wrong-guess feedback.
      role="status"
      aria-live="polite"
      initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-2 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
    >
      <Flame className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0 text-foreground">
        <span className="font-semibold text-warning">{t('game.proximity.warmer')}</span>{' '}
        <span className="text-foreground/90">
          {t(RELATION_KEY[hint.relation], { value: hint.value })}
        </span>
      </span>
    </m.div>
  )
}
