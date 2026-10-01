import { useTranslation } from 'react-i18next'
import { Check, Minus } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
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
    <span className={cn('inline-flex items-center justify-center', on ? 'text-success' : 'text-muted-foreground')}>
      {on ? <Check className="size-5" aria-hidden="true" /> : <Minus className="size-5" aria-hidden="true" />}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function FeatureMatrix() {
  const { t } = useTranslation()
  return (
    <Card className="mx-auto max-w-3xl overflow-hidden">
      <CardHeader>
        <h2 className="text-xl font-semibold sm:text-2xl">{t('pricing.features.title')}</h2>
      </CardHeader>
      <table className="w-full text-sm sm:text-base">
        <thead>
          <tr className="border-y border-border bg-muted/30">
            <th scope="col" className="px-(--card-padding) py-2 text-left font-medium">
              <span className="sr-only">{t('pricing.features.title')}</span>
            </th>
            <th scope="col" className="w-20 px-2 py-2 text-center font-medium text-muted-foreground sm:w-28">
              {t('pricing.features.free')}
            </th>
            <th scope="col" className="w-20 px-2 py-2 text-center font-medium text-neon-pink sm:w-28">
              {t('pricing.features.premium')}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-b-0">
              <th scope="row" className="px-(--card-padding) py-3 text-left font-normal">
                {t(`pricing.features.items.${row.key}`)}
              </th>
              <td className="px-2 py-3 text-center">
                <FeatureCell on={row.free} label={row.free ? t('pricing.features.yes') : t('pricing.features.no')} />
              </td>
              <td className="px-2 py-3 text-center">
                <FeatureCell on={row.premium} label={row.premium ? t('pricing.features.yes') : t('pricing.features.no')} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
