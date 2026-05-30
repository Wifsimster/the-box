import { useCallback, useState } from 'react'
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
// Cold-start CTAs ("Activer un jeu") deep-link straight to the Candidats
// filter so the moderator lands on the curation funnel without a second
// click. Anything else just falls back to the default Activés filter.
type CatalogFilter = 'enabled' | 'no-map' | 'candidates' | 'all'
const CATALOG_FILTERS: CatalogFilter[] = ['enabled', 'no-map', 'candidates', 'all']

export function GeoReviewPanel() {
    const { t } = useTranslation()
    // Sub-tab lives in the URL (`?sub=…`) so AdminPage's redirect map can
    // deep-link `?tab=geoFetch` straight into Acquisition and the
    // moderator's tab choice survives a refresh. The legacy `?view=…`
    // segment is read once for backward compatibility (cold-start CTAs)
    // but no longer written.
    const [searchParams, setSearchParams] = useSearchParams()
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
            // `filter`/`view` are meaningful only on the Catalogue tab —
            // strip them when navigating away so URLs stay clean.
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
    // Default to the only status that needs the moderator's attention. The
    // other statuses are still reachable via the chip row, but the page
    // should not open on `collecting` (no decision possible) or `all` (mixes
    // already-handled rows into the queue).
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
    // Per-game filter for the Pins tab. Set when the operator clicks "Voir
    // les captures" on a Maps row so the candidate list narrows to that game.
    // Cleared via the badge in the Pins header. Lifted here (rather than inside
    // GeoReviewQueue) because the catalog tab and the status rail also drive it.
    const [gameFilter, setGameFilter] = useState<GameFilter | null>(null)
    // Owned here (not inside GeoMapsTab) so an in-flight manual run keeps
    // polling and the live banner stays visible when the operator switches
    // between Pins / Maps / Games tabs.
    const { state: runState, error: runError, arm: armRunPolling } = useGeoRunPolling()
    // Single health subscription shared between the counter strip and the
    // cold-start banner — keeps them in sync without a duplicate poll.
    const { data: health, loading: healthLoading, error: healthError } = useGeoHealth()

    // When the URL doesn't pin a `sub`, route the moderator to the tab
    // where their next action lives, derived from the live health snapshot:
    //   queue.pending > 0       → queue        (steady-state daily routine)
    //   curated === 0           → catalog      (cold start: activate a game)
    //   withMap === 0           → acquisition  (games activated, ingest maps)
    //   otherwise               → queue        (empty queue is diagnostic)
    // We DON'T rewrite the URL — `subInUrl === null` keeps the URL clean
    // and explicit clicks still set `?sub=…` as before.
    const resolvedDefault: GeoSubTab | null = (() => {
        if (!health) return null
        const queueCount = health.queue.active + health.queue.waiting
        if (queueCount > 0) return 'queue'
        if (health.coverage.curated === 0) return 'catalog'
        if (health.coverage.withMap === 0) return 'acquisition'
        return 'queue'
    })()
    const activeTab: GeoSubTab = subInUrl ?? resolvedDefault ?? 'queue'
    // When the cold-start state-machine routes to `catalog`, pre-select the
    // Candidats filter so the CTA the moderator sees in the empty state is
    // the curation funnel (the actual first action they need to take).
    const effectiveCatalogFilter: CatalogFilter =
        !subInUrl && resolvedDefault === 'catalog' && !catalogFilterFromUrl
            ? 'candidates'
            : (catalogFilterFromUrl ?? 'enabled')

    const viewCapturesForGame = (gameId: number, gameName: string) => {
        // GeoReviewQueue owns candidate/detail state; switching to the queue
        // tab remounts it fresh (Radix unmounts inactive tabs), so we only
        // need to seed the shared filters here.
        setGameFilter({ gameId, gameName })
        setStatusFilter('all')
        setActiveTab('queue')
    }

    return (
        <div className="space-y-4">
            {/* Page header */}
            <header className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                    <MapPin className="size-5 text-neon-pink" />
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
                <TabsList className="w-full overflow-x-auto justify-start scrollbar-hide">
                    <TabsTrigger value="catalog" className="gap-1.5 shrink-0">
                        <Library className="size-3.5" />
                        {t('admin.geo.tabs.catalog')}
                    </TabsTrigger>
                    <TabsTrigger value="acquisition" className="gap-1.5 shrink-0">
                        <Workflow className="size-3.5" />
                        {t('admin.geo.tabs.acquisition')}
                    </TabsTrigger>
                    <TabsTrigger value="queue" className="gap-1.5 shrink-0">
                        <ListChecks className="size-3.5" />
                        {t('admin.geo.tabs.queue')}
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="gap-1.5 shrink-0">
                        <Flag className="size-3.5" />
                        {t('admin.geo.tabs.reports')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="acquisition" className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        {t('admin.geo.tabs.acquisitionDescription')}
                    </p>
                    {/* Folded the standalone "Cartes" admin tab in here so
                        ingestion controls live next door to the moderation
                        queue and the catalog they feed. The previous tab
                        duplicated triggers already exposed in
                        Catalogue › Cartes; the IA now keeps a single
                        ingestion entry-point. */}
                    <GeoFetchPanel />
                </TabsContent>

                <TabsContent value="reports" className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        {t('admin.geo.tabs.reportsDescription')}
                    </p>
                    <ReportsModerationPanel />
                </TabsContent>

                <TabsContent value="catalog" className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        {t('admin.geo.tabs.catalogDescription')}
                    </p>
                    {/* Maps + Games used to live behind a [Cartes | Jeux]
                        sub-toggle; the unified Catalogue datatable below
                        absorbs both surfaces with filter pills (Activés /
                        Sans carte / Candidats / Tous). The cold-start CTA
                        deep-links into the Candidats filter. */}
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

