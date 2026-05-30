import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeatureRow {
  key: string
  free: boolean
  premium: boolean
}

const ROWS: FeatureRow[] = [
  { key: 'dailyChallenge', free: true, premium: true },
  { key: 'leaderboards', free: true, premium: true },
  { key: 'achievements', free: true, premium: true },
  { key: 'hintsBaseline', free: true, premium: true },
  { key: 'catchUp7d', free: false, premium: true },
  { key: 'catchUpFull', free: false, premium: true },
  { key: 'hintsUnlimitedCatchUp', free: false, premium: true },
  { key: 'advancedStats', free: false, premium: true },
  { key: 'cosmetics', free: false, premium: true },
  { key: 'themes', free: false, premium: true },
  { key: 'earlyAccess', free: false, premium: true },
  { key: 'geoMode', free: false, premium: true },
]

function FeatureCell({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center', on ? 'text-success' : 'text-muted-foreground/50')}>
      {on ? <Check className="size-5" aria-label={label} /> : <X className="size-5" aria-label={label} />}
    </span>
  )
}

export function FeatureMatrix() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <h2 className="text-lg font-semibold px-4 sm:px-6 py-3 border-b border-border/60">
        {t('pricing.features.title')}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className="text-left px-4 sm:px-6 py-2 font-medium text-muted-foreground"></th>
              <th className="px-3 py-2 font-medium text-muted-foreground w-24 text-center">
                {t('pricing.features.free')}
              </th>
              <th className="px-3 py-2 font-medium text-neon-pink w-24 text-center">
                {t('pricing.features.premium')}
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b border-border/40 last:border-b-0">
                <td className="px-4 sm:px-6 py-3 text-foreground/90">{t(`pricing.features.items.${row.key}`)}</td>
                <td className="text-center py-3">
                  <FeatureCell on={row.free} label={row.free ? t('pricing.features.yes') : t('pricing.features.no')} />
                </td>
                <td className="text-center py-3">
                  <FeatureCell on={row.premium} label={row.premium ? t('pricing.features.yes') : t('pricing.features.no')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
