import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, MessageSquareText, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import { adminApi } from '@/lib/api/admin'
import type { DescribeGuessAdminEntry } from '@/types'

const PAGE_SIZE = 50

function formatWhen(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })
}

function Verdict({ row }: { row: DescribeGuessAdminEntry }) {
  const { t } = useTranslation()
  if (row.accepted === null) {
    return (
      <Badge variant="outline" className="text-xs font-normal" title={row.error ?? undefined}>
        {t('admin.describeGuess.noVerdict')}
        {row.error ? ` · ${row.error}` : ''}
      </Badge>
    )
  }
  return row.accepted ? (
    <Badge variant="success" className="text-xs">{t('admin.describeGuess.accepted')}</Badge>
  ) : (
    <Badge variant="secondary" className="text-xs">{t('admin.describeGuess.rejected')}</Badge>
  )
}

export function DescribeGuessPanel() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(1)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [entries, setEntries] = useState<DescribeGuessAdminEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const requestKey = `${page}:${reloadNonce}`
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = settledKey !== requestKey

  useEffect(() => {
    let cancelled = false
    adminApi
      .listDescribeGuesses({ page, limit: PAGE_SIZE })
      .then(
        (result) => {
          if (cancelled) return
          setEntries(result.entries)
          setTotal(result.total)
        },
        (err) => {
          if (cancelled) return
          toast.error(String(err instanceof Error ? err.message : err))
          setEntries([])
          setTotal(0)
        }
      )
      .finally(() => {
        if (!cancelled) setSettledKey(requestKey)
      })
    return () => {
      cancelled = true
    }
  }, [page, requestKey])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg min-w-0">
          <MessageSquareText className="size-4 text-neon-purple shrink-0" aria-hidden="true" />
          <span className="truncate">{t('admin.describeGuess.title')}</span>
          <Badge variant="outline" className="shrink-0 text-xs font-normal tabular-nums">
            {t('admin.describeGuess.totalCount', { count: total })}
          </Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setReloadNonce((n) => n + 1)}
          disabled={loading}
          aria-label={t('admin.jobs.refresh')}
          title={t('admin.jobs.refresh')}
          className="shrink-0"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('admin.describeGuess.intro')}</p>

        {loading && entries === null ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : entries && entries.length > 0 ? (
          <ul className="space-y-2" data-testid="describe-guess-admin-list">
            {entries.map((row) => (
              <li key={row.id} className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                <p className="text-sm break-words">{row.guessText}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">{t('admin.describeGuess.table.target')}</dt>
                  <dd className="break-words">{row.targetName ?? `#${row.targetGameId}`}</dd>
                  <dt className="text-muted-foreground">{t('admin.describeGuess.table.chosen')}</dt>
                  <dd className="break-words">
                    {row.chosenGameId === null ? '—' : (row.chosenName ?? `#${row.chosenGameId}`)}
                  </dd>
                  <dt className="text-muted-foreground">{t('admin.describeGuess.table.probability')}</dt>
                  <dd className="tabular-nums">{row.probability === null ? '—' : row.probability.toFixed(2)}</dd>
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  <Verdict row={row} />
                  {row.titlePrefilterHit && (
                    <Badge variant="warning" className="text-xs">{t('admin.describeGuess.titleHit')}</Badge>
                  )}
                  {row.isGuest && (
                    <Badge variant="outline" className="text-xs font-normal">{t('admin.describeGuess.guest')}</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {row.locale} · {row.model}
                    {row.latencyMs !== null ? ` · ${row.latencyMs} ms` : ''} · {formatWhen(row.createdAt, i18n.language)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('admin.describeGuess.empty')}</p>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              aria-label={t('admin.describeGuess.previous')}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('admin.describeGuess.pageOf', { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              aria-label={t('admin.describeGuess.next')}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
