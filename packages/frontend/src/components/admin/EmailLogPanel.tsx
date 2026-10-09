import { useEffect, useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, Mail, MailX, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import type {
  EmailLogEntry,
  EmailLogStatus,
  EmailLogType,
} from '@/types'

const TYPE_OPTIONS: EmailLogType[] = [
  'password-reset',
  'verification',
  'streak-risk',
  'relance',
  'inactive-reminder',
  'referral-announcement',
  'admin-test',
]

const STATUS_OPTIONS: EmailLogStatus[] = ['sent', 'failed', 'skipped']

const PAGE_SIZE = 25

const SELECT_CLASS =
  'h-(--control-h) w-full sm:w-auto rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

// The query controls (pagination + the three filters + its debounced mirror)
// are one cohesive slice: every filter change must atomically reset the page
// back to 1, so they live in a single reducer that returns the next snapshot
// in one step rather than chaining setState calls.
interface QueryState {
  page: number
  status: EmailLogStatus | ''
  type: EmailLogType | ''
  search: string
  debouncedSearch: string
}

type QueryAction =
  | { type: 'setStatus'; value: EmailLogStatus | '' }
  | { type: 'setType'; value: EmailLogType | '' }
  | { type: 'setSearch'; value: string }
  | { type: 'commitSearch'; value: string }
  | { type: 'setPage'; value: number }

const INITIAL_QUERY: QueryState = {
  page: 1,
  status: '',
  type: '',
  search: '',
  debouncedSearch: '',
}

function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'setStatus':
      return { ...state, status: action.value, page: 1 }
    case 'setType':
      return { ...state, type: action.value, page: 1 }
    case 'setSearch':
      return { ...state, search: action.value }
    case 'commitSearch':
      if (action.value === state.debouncedSearch) return state
      return { ...state, debouncedSearch: action.value, page: 1 }
    case 'setPage':
      return { ...state, page: action.value }
  }
}

export function EmailLogPanel() {
  const { t, i18n } = useTranslation()
  const [entries, setEntries] = useState<EmailLogEntry[] | null>(null)
  const [total, setTotal] = useState(0)
  const [query, dispatch] = useReducer(queryReducer, INITIAL_QUERY)
  const { page, status, type, search, debouncedSearch } = query
  // Bumped by the refresh button to re-run the fetch effect for the same query.
  const [reloadNonce, setReloadNonce] = useState(0)
  // `loading` is derived: the list is loading until the request for the
  // current query (and refresh nonce) has settled.
  const requestKey = JSON.stringify([page, status, type, debouncedSearch, reloadNonce])
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const loading = settledKey !== requestKey

  useEffect(() => {
    const handle = setTimeout(() => dispatch({ type: 'commitSearch', value: search }), 300)
    return () => clearTimeout(handle)
  }, [search])

  useEffect(() => {
    let cancelled = false
    adminApi
      .listEmailLog({
        page,
        limit: PAGE_SIZE,
        status: status || undefined,
        type: type || undefined,
        search: debouncedSearch || undefined,
      })
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
        },
      )
      .finally(() => {
        if (!cancelled) setSettledKey(requestKey)
      })
    return () => {
      cancelled = true
    }
  }, [page, status, type, debouncedSearch, requestKey])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg min-w-0">
          <Mail className="size-4 text-neon-purple shrink-0" aria-hidden="true" />
          <span className="truncate">{t('admin.emailLog.title')}</span>
          <Badge variant="outline" className="shrink-0 text-xs font-normal tabular-nums">
            {t('admin.emailLog.totalCount', { count: total })}
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
      <CardContent>
        <div className="grid grid-cols-2 gap-2 mb-4 sm:flex sm:flex-row">
          <div className="relative col-span-2 sm:max-w-xs sm:flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              aria-label={t('admin.emailLog.searchPlaceholder')}
              placeholder={t('admin.emailLog.searchPlaceholder')}
              value={search}
              onChange={(e) => dispatch({ type: 'setSearch', value: e.target.value })}
              className="pl-9"
            />
          </div>
          <select
            aria-label={t('admin.emailLog.filterType')}
            value={type}
            onChange={(e) =>
              dispatch({ type: 'setType', value: e.target.value as EmailLogType | '' })
            }
            className={SELECT_CLASS}
          >
            <option value="">{t('admin.emailLog.filterType')}</option>
            {TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {t(`admin.emailLog.types.${o}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('admin.emailLog.filterStatus')}
            value={status}
            onChange={(e) =>
              dispatch({ type: 'setStatus', value: e.target.value as EmailLogStatus | '' })
            }
            className={SELECT_CLASS}
          >
            <option value="">{t('admin.emailLog.filterStatus')}</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {t(`admin.emailLog.statuses.${o}`)}
              </option>
            ))}
          </select>
        </div>

        {loading && entries === null ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3 md:rounded-none md:border-0 md:border-b">
                <div className="flex justify-between gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-3/4" variant="text" />
              </div>
            ))}
          </div>
        ) : entries && entries.length > 0 ? (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {entries.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-background/40 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-xs font-normal">
                      {t(`admin.emailLog.types.${row.type}`)}
                    </Badge>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="font-mono text-xs break-all text-muted-foreground">
                    {row.recipient}
                  </div>
                  <div className="text-sm break-words" title={row.subject}>
                    {row.subject}
                  </div>
                  {row.errorMessage && (
                    <div className="text-xs text-destructive break-words">
                      {row.errorMessage}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatWhen(row.sentAt, i18n.language)}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('admin.emailLog.table.sentAt')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.emailLog.table.recipient')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.emailLog.table.type')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.emailLog.table.subject')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.emailLog.table.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formatWhen(row.sentAt, i18n.language)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs break-all">{row.recipient}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="text-xs font-normal">
                          {t(`admin.emailLog.types.${row.type}`)}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 max-w-md">
                        <div className="truncate" title={row.subject}>
                          {row.subject}
                        </div>
                        {row.errorMessage && (
                          <div className="text-xs text-destructive truncate" title={row.errorMessage}>
                            {row.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav aria-label={t('admin.emailLog.pageOf', { page, totalPages })} className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span aria-live="polite">
                {t('admin.emailLog.pageOf', { page, totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('game.navigation.previous')}
                  onClick={() => dispatch({ type: 'setPage', value: Math.max(1, page - 1) })}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('common.next')}
                  onClick={() =>
                    dispatch({ type: 'setPage', value: Math.min(totalPages, page + 1) })
                  }
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </nav>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <MailX className="size-8" aria-hidden="true" />
            <p>{t('admin.emailLog.empty')}</p>
            {(search || type || status) && (
              <Button
                variant="outline"
                onClick={() => {
                  dispatch({ type: 'setSearch', value: '' })
                  dispatch({ type: 'setType', value: '' })
                  dispatch({ type: 'setStatus', value: '' })
                }}
              >
                {t('common.clearAll')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: EmailLogStatus }) {
  const { t } = useTranslation()
  const variant: 'default' | 'destructive' | 'secondary' =
    status === 'sent' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'
  return (
    <Badge variant={variant} className="text-xs">
      {t(`admin.emailLog.statuses.${status}`)}
    </Badge>
  )
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale)
  } catch {
    return iso
  }
}
