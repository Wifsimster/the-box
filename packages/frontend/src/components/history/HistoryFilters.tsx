import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CheckCircle2, Clock, RefreshCw, Search, X } from 'lucide-react'

export type HistoryStatusFilter = 'all' | 'completed' | 'inProgress'

/**
 * Search + status filter controls for the history timeline. Extracted from
 * HistoryPage to keep the page component focused on data + state.
 */
export function HistoryFilters({
  statusFilter,
  searchQuery,
  loading,
  onRefresh,
  onStatusChange,
  onSearchChange,
  onClear,
}: {
  statusFilter: HistoryStatusFilter
  searchQuery: string
  loading: boolean
  onRefresh: () => void
  onStatusChange: (value: HistoryStatusFilter) => void
  onSearchChange: (value: string) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const hasActiveFilters = statusFilter !== 'all' || searchQuery !== ''

  return (
    <div role="search" className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Label htmlFor="history-search" className="sr-only">
            {t('history.searchLabel')}
          </Label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="history-search"
            type="search"
            placeholder={t('history.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={loading}
          aria-label={t('history.refreshLabel')}
          aria-busy={loading}
          className="shrink-0"
        >
          <RefreshCw className={loading ? 'motion-safe:animate-spin' : undefined} aria-hidden="true" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={statusFilter}
          onValueChange={(value) => {
            if (value === 'all' || value === 'completed' || value === 'inProgress') {
              onStatusChange(value)
            }
          }}
          aria-label={t('common.filters')}
        >
          <ToggleGroupItem value="all" className="min-h-(--control-h) text-sm">
            {t('common.all')}
          </ToggleGroupItem>
          <ToggleGroupItem value="completed" className="min-h-(--control-h) text-sm">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t('history.completed')}
          </ToggleGroupItem>
          <ToggleGroupItem value="inProgress" className="min-h-(--control-h) text-sm">
            <Clock className="size-4" aria-hidden="true" />
            {t('history.inProgress')}
          </ToggleGroupItem>
        </ToggleGroup>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="ml-auto text-primary"
          >
            <X aria-hidden="true" />
            {t('common.clearAll')}
          </Button>
        )}
      </div>
    </div>
  )
}
