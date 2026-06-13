import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CheckCircle2, Clock, RefreshCw } from 'lucide-react'

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
  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg font-bold">{t('common.filters')}</CardTitle>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label={t('history.refreshLabel')}
            aria-busy={loading}
            className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md p-1 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-4 sm:size-5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Search Bar */}
          <div className="flex-1">
            <Label htmlFor="history-search" className="sr-only">
              {t('history.searchLabel')}
            </Label>
            <Input
              id="history-search"
              type="search"
              placeholder={t('history.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Status Filter — Radix ToggleGroup gives aria-pressed + roving tabindex */}
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
            <ToggleGroupItem value="all" aria-label={t('common.all')}>
              {t('common.all')}
            </ToggleGroupItem>
            <ToggleGroupItem value="completed" aria-label={t('history.completed')}>
              <CheckCircle2 className="size-3 sm:size-4" aria-hidden="true" />
              {t('history.completed')}
            </ToggleGroupItem>
            <ToggleGroupItem value="inProgress" aria-label={t('history.inProgress')}>
              <Clock className="size-3 sm:size-4" aria-hidden="true" />
              {t('history.inProgress')}
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Active Filters Display */}
          {(statusFilter !== 'all' || searchQuery) && (
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <span className="text-xs sm:text-sm text-muted-foreground">
                {t('common.activeFilters')}:
              </span>
              {statusFilter !== 'all' && (
                <Badge variant="outline" className="text-xs">
                  {statusFilter === 'completed' ? t('history.completed') : t('history.inProgress')}
                </Badge>
              )}
              {searchQuery && (
                <Badge variant="outline" className="text-xs">
                  {searchQuery}
                </Badge>
              )}
              <button
                type="button"
                onClick={onClear}
                className="ml-auto text-xs sm:text-sm text-primary hover:underline"
              >
                {t('common.clearAll')}
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
