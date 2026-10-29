import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    MapPin,
    ListChecks,
    Library,
    Flag,
    Workflow,
} from 'lucide-react'
import { GeoMapsTab } from './GeoMapsTab'
import { ModerationStatusRail } from './ModerationStatusRail'
import { ReportsModerationPanel } from './ReportsModerationPanel'
import { GeoReviewQueue, type StatusFilter, type GameFilter } from './GeoReviewQueue'
import GeoFetchPanel from './geo-fetch/GeoFetchPanel'
import { useGeoRunPolling } from '@/hooks/useGeoRunPolling'
import { useGeoHealth } from '@/hooks/useGeoHealth'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type GeoSubTab = 'catalog' | 'acquisition' | 'queue' | 'reports'
const SUB_TABS: GeoSubTab[] = ['catalog', 'acquisition', 'queue', 'reports']
type CatalogFilter = 'enabled' | 'no-map' | 'candidates' | 'all'
const CATALOG_FILTERS: CatalogFilter[] = ['enabled', 'no-map', 'candidates', 'all']

export function GeoReviewPanel() {
    const { t } = useTranslation()
    const [searchParams, setSearchParams] = useSearchParams()
    const seedGameIdRaw = searchParams.get('qGameId')
    const seedGameId =
        seedGameIdRaw && Number.isFinite(Number(seedGameIdRaw)) ? Number(seedGameIdRaw) : null
    const seedGameName = searchParams.get('qGameName')
    const subFromUrl = searchParams.get('sub')
    const subInUrl: GeoSubTab | null =
        subFromUrl && (SUB_TABS as string[]).includes(subFromUrl)
            ? (subFromUrl as GeoSubTab)
            : null
    const viewFromUrl = searchParams.get('view')
    const filterFromUrl = searchParams.get('filter')
    const catalogFilterFromUrl: CatalogFilter | undefined =
        filterFromUrl && (CATALOG_FILTERS as string[]).includes(filterFromUrl)
            ? (filterFromUrl as CatalogFilter)
            : viewFromUrl === 'games'
              ? 'candidates'
              : undefined
    const setActiveTab = useCallback(
        (next: GeoSubTab) => {
            const params = new URLSearchParams(searchParams)
            if (next === 'queue') params.delete('sub')
            else params.set('sub', next)
            if (next !== 'catalog') {
                params.delete('view')
                params.delete('filter')
            }
            setSearchParams(params, { replace: true })
        },
        [searchParams, setSearchParams],
    )
    const goToCatalogWithFilter = useCallback(
        (next: CatalogFilter) => {
            const params = new URLSearchParams(searchParams)
            params.set('sub', 'catalog')
            params.delete('view')
            if (next === 'enabled') params.delete('filter')
            else params.set('filter', next)
            setSearchParams(params, { replace: true })
        },
        [searchParams, setSearchParams],
    )
    const [statusFilter, setStatusFilter] = useState<StatusFilter>(
        seedGameId != null ? 'all' : 'pending',
    )
    const [gameFilter, setGameFilter] = useState<GameFilter | null>(
        seedGameId != null
            ? { gameId: seedGameId, gameName: seedGameName ?? `#${seedGameId}` }
            : null,
    )
    const [prevSeedGameId, setPrevSeedGameId] = useState(seedGameId)
    if (seedGameId !== prevSeedGameId) {
        setPrevSeedGameId(seedGameId)
        if (seedGameId != null) {
            setGameFilter({ gameId: seedGameId, gameName: seedGameName ?? `#${seedGameId}` })
            setStatusFilter('all')
        }
    }
    const rootRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!searchParams.has('qGameId') && !searchParams.has('qGameName')) return
        const params = new URLSearchParams(searchParams)
        params.delete('qGameId')
        params.delete('qGameName')
        setSearchParams(params, { replace: true })
        rootRef.current?.scrollIntoView({ block: 'start' })
    }, [searchParams, setSearchParams])
    const { state: runState, error: runError, arm: armRunPolling } = useGeoRunPolling()
    const { data: health, loading: healthLoading, error: healthError } = useGeoHealth()

    const resolvedDefault: GeoSubTab | null = (() => {
        if (!health) return null
        const queueCount = health.queue.active + health.queue.waiting
        if (queueCount > 0) return 'queue'
        if (health.coverage.curated === 0) return 'catalog'
        if (health.coverage.withMap === 0) return 'acquisition'
        return 'queue'
    })()
    const activeTab: GeoSubTab = subInUrl ?? (seedGameId != null ? 'queue' : resolvedDefault) ?? 'queue'
    const effectiveCatalogFilter: CatalogFilter =
        !subInUrl && resolvedDefault === 'catalog' && !catalogFilterFromUrl
            ? 'candidates'
            : (catalogFilterFromUrl ?? 'enabled')

    const viewCapturesForGame = (gameId: number, gameName: string) => {
        setGameFilter({ gameId, gameName })
        setStatusFilter('all')
        setActiveTab('queue')
    }

    return (
        <div ref={rootRef} className="space-y-4 scroll-mt-[calc(var(--header-h)+4.5rem)] sm:scroll-mt-[calc(var(--header-h)+1rem)]">
            <header className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
                    <MapPin className="size-5 text-neon-pink" aria-hidden="true" />
                    {t('admin.geo.title')}
                </h2>
                <p className="text-sm text-muted-foreground">{t('admin.geo.subtitle')}</p>
            </header>

            <ModerationStatusRail
                health={health}
                healthLoading={healthLoading}
                healthError={healthError}
                runState={runState}
                onMapsClick={() => goToCatalogWithFilter('enabled')}
                onPinsClick={() => {
                    setActiveTab('queue')
                    setStatusFilter('pending')
                    setGameFilter(null)
                }}
                onActivateGames={() => goToCatalogWithFilter('candidates')}
                onGoToAcquisition={() => setActiveTab('acquisition')}
            />

            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as GeoSubTab)}
                className="space-y-4"
            >
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="catalog" className="gap-1.5 shrink-0">
                        <Library className="size-3.5" aria-hidden="true" />
                        {t('admin.geo.tabs.catalog')}
                    </TabsTrigger>
                    <TabsTrigger value="acquisition" className="gap-1.5 shrink-0">
                        <Workflow className="size-3.5" aria-hidden="true" />
                        {t('admin.geo.tabs.acquisition')}
                    </TabsTrigger>
                    <TabsTrigger value="queue" className="gap-1.5 shrink-0">
                        <ListChecks className="size-3.5" aria-hidden="true" />
                        {t('admin.geo.tabs.queue')}
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="gap-1.5 shrink-0">
                        <Flag className="size-3.5" aria-hidden="true" />
                        {t('admin.geo.tabs.reports')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="acquisition" className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {t('admin.geo.tabs.acquisitionDescription')}
                    </p>
                    <GeoFetchPanel />
                </TabsContent>

                <TabsContent value="reports" className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {t('admin.geo.tabs.reportsDescription')}
                    </p>
                    <ReportsModerationPanel />
                </TabsContent>

                <TabsContent value="catalog" className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {t('admin.geo.tabs.catalogDescription')}
                    </p>
                    <GeoMapsTab
                        runState={runState}
                        runError={runError}
                        armRunPolling={armRunPolling}
                        onViewCaptures={viewCapturesForGame}
                        onGoToAcquisition={() => setActiveTab('acquisition')}
                        initialFilter={effectiveCatalogFilter}
                    />
                </TabsContent>

                <TabsContent value="queue" className="space-y-4">
                    <GeoReviewQueue
                        statusFilter={statusFilter}
                        onStatusFilterChange={setStatusFilter}
                        gameFilter={gameFilter}
                        onGameFilterChange={setGameFilter}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}

