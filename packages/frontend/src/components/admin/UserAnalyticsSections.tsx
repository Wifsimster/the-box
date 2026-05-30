import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import type { UserAnalytics } from '@/lib/api/admin'
import { numberFormat } from './user-analytics-format'

const formatDateTime = (iso: string | null, lang: string, fallback: string) => {
  if (!iso) return fallback
  return new Date(iso).toLocaleString(lang, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

const formatRelative = (iso: string | null, lang: string, fallback: string) => {
  if (!iso) return fallback
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return formatDateTime(iso, lang, fallback)
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.round(hours / 24)
  return `${days} j`
}

type TopPlayersVariant = 'sessions' | 'score'

interface TopPlayersListProps {
  title: string
  hint: string
  icon: React.ReactNode
  rows: UserAnalytics['topBySessions'] | UserAnalytics['topByScore']
  lang: string
  /** Selects which trailing stat the rows render. */
  variant: TopPlayersVariant
}

function TopPlayerMeta({
  variant,
  row,
  lang,
}: {
  variant: TopPlayersVariant
  row: UserAnalytics['topBySessions'][number] & UserAnalytics['topByScore'][number]
  lang: string
}) {
  const { t } = useTranslation()
  if (variant === 'sessions') {
    return (
      <>
        <span className="text-muted-foreground">
          {t('admin.analytics.completedSessions', { completed: row.completed })}
        </span>
        <span className="font-semibold text-neon-cyan tabular-nums">{row.sessions}</span>
      </>
    )
  }
  return (
    <>
      <span className="text-muted-foreground">🔥 {row.currentStreak}</span>
      <span className="font-semibold text-neon-pink tabular-nums">
        {numberFormat(row.totalScore, lang)}
      </span>
    </>
  )
}

export function TopPlayersList({ title, hint, icon, rows, lang, variant }: TopPlayersListProps) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          {icon}
          {title}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">{hint}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('admin.analytics.empty')}
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {rows.map((row, index) => (
              <li
                key={row.userId}
                className="flex items-center justify-between py-2 gap-2 text-sm"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="text-muted-foreground font-mono w-6 text-center">
                    #{index + 1}
                  </span>
                  <span className="font-medium truncate">{row.displayName}</span>
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <TopPlayerMeta
                    variant={variant}
                    row={
                      row as UserAnalytics['topBySessions'][number] &
                        UserAnalytics['topByScore'][number]
                    }
                    lang={lang}
                  />
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export function RecentlyActiveTable({
  rows,
  lang,
  never,
}: {
  rows: UserAnalytics['recentlyActive']
  lang: string
  never: string
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg">
          {t('admin.analytics.recentlyActiveTitle')}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          {t('admin.analytics.recentlyActiveHint')}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t('admin.analytics.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 px-2 font-medium">{t('admin.analytics.colUser')}</th>
                  <th className="pb-2 px-2 font-medium">{t('admin.analytics.colJoined')}</th>
                  <th className="pb-2 px-2 font-medium">{t('admin.analytics.colLastLogin')}</th>
                  <th className="pb-2 px-2 font-medium">{t('admin.analytics.colLastPlayed')}</th>
                  <th className="pb-2 px-2 font-medium text-right">
                    {t('admin.analytics.colScore')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td className="p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{row.displayName}</span>
                        {row.banned && (
                          <span className="text-[10px] uppercase tracking-wide text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                            {t('admin.analytics.banned')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{row.email}</div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(row.createdAt, lang, never)}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground tabular-nums">
                      {formatRelative(row.lastLoginAt, lang, never)}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground tabular-nums">
                      {formatRelative(row.lastPlayedAt, lang, never)}
                    </td>
                    <td className="p-2 text-right text-xs tabular-nums font-semibold text-neon-cyan">
                      {numberFormat(row.totalScore, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
