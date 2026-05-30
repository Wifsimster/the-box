import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { Loader2, RefreshCw, Mail, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handle = setTimeout(() => dispatch({ type: 'commitSearch', value: search }), 300)
    return () => clearTimeout(handle)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminApi.listEmailLog({
        page,
        limit: PAGE_SIZE,
        status: status || undefined,
        type: type || undefined,
        search: debouncedSearch || undefined,
      })
      setEntries(result.entries)
      setTotal(result.total)
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err))
      setEntries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, status, type, debouncedSearch])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 gap-y-0 p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base min-w-0">
          <Mail className="size-4 text-neon-purple shrink-0" />
          <span className="truncate">{t('admin.emailLog.title')}</span>
          <Badge variant="outline" className="ml-2 text-xs">
            {t('admin.emailLog.totalCount', { count: total })}
          </Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          title={t('common.retry')}
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <Input
            placeholder={t('admin.emailLog.searchPlaceholder')}
            value={search}
            onChange={(e) => dispatch({ type: 'setSearch', value: e.target.value })}
            className="sm:max-w-xs"
          />
          <select
            value={type}
            onChange={(e) =>
              dispatch({ type: 'setType', value: e.target.value as EmailLogType | '' })
            }
            className="bg-background border border-border rounded-md px-3 py-2 text-sm w-full sm:w-auto"
          >
            <option value="">{t('admin.emailLog.filterType')}</option>
            {TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {t(`admin.emailLog.types.${o}`)}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) =>
              dispatch({ type: 'setStatus', value: e.target.value as EmailLogStatus | '' })
            }
            className="bg-background border border-border rounded-md px-3 py-2 text-sm w-full sm:w-auto"
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
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-neon-purple" />
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
                    <Badge variant="outline" className="text-[10px] font-normal">
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
                    <div className="text-[11px] text-destructive break-words" title={row.errorMessage}>
                      {row.errorMessage}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground">
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
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {t(`admin.emailLog.types.${row.type}`)}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 max-w-md">
                        <div className="truncate" title={row.subject}>
                          {row.subject}
                        </div>
                        {row.errorMessage && (
                          <div className="text-[11px] text-destructive truncate" title={row.errorMessage}>
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

            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <span>
                {t('admin.emailLog.pageOf', { page, totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dispatch({ type: 'setPage', value: Math.max(1, page - 1) })}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    dispatch({ type: 'setPage', value: Math.min(totalPages, page + 1) })
                  }
                  disabled={page >= totalPages || loading}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('admin.emailLog.empty')}
          </p>
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
    <Badge variant={variant} className="text-[10px]">
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
