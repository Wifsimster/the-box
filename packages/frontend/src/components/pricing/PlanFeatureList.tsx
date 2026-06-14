import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'

interface PlanFeatureListProps {
  /** i18n item keys resolved under `pricing.features.items.*`. */
  featureKeys: readonly string[]
  /** Optional lead line above the list, e.g. "Everything in Free, plus:". */
  leadKey?: string
}

/** Bulleted "what's included" list shown inside a pricing card so each plan
 *  states its benefits without the reader scrolling to the comparison table. */
export function PlanFeatureList({ featureKeys, leadKey }: PlanFeatureListProps) {
  const { t } = useTranslation()
  return (
    <ul className="space-y-2 text-sm">
      {leadKey && <li className="font-medium text-muted-foreground">{t(leadKey)}</li>}
      {featureKeys.map((key) => (
        <li key={key} className="flex items-start gap-2">
          <Check className="size-4 mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <span className="text-foreground/90">{t(`pricing.features.items.${key}`)}</span>
        </li>
      ))}
    </ul>
  )
}
