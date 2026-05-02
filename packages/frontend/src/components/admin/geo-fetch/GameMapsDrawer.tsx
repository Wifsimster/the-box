import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Star, Check, RotateCcw } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { geoFetchApi, type GeoFetchMapsResponse } from '@/lib/api/geo-fetch'
import { useGeoFetchStore } from '@/stores/geoFetchStore'

interface Props {
  gameId: number | null
  onClose: () => void
}

// Per-game curation drawer. Loads /maps for the open gameId, groups by zone,
// shows side-by-side candidates from all providers. One click "Choisir" sets
// is_selected. Closing the drawer clears state — re-opening refetches.

export function GameMapsDrawer({ gameId, onClose }: Props) {
  const { t } = useTranslation()
  const [data, setData] = useState<GeoFetchMapsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [busyMapId, setBusyMapId] = useState<number | null>(null)
  const selectMap = useGeoFetchStore((s) => s.selectMap)
  const retrySource = useGeoFetchStore((s) => s.retrySource)

  useEffect(() => {
    if (gameId == null) {
      setData(null)
      return
    }
    setIsLoading(true)
    geoFetchApi
      .maps(gameId)
      .then(setData)
      .finally(() => setIsLoading(false))
  }, [gameId])

  async function handleSelect(mapId: number) {
    if (gameId == null) return
    setBusyMapId(mapId)
    try {
      await selectMap(gameId, mapId)
      const fresh = await geoFetchApi.maps(gameId)
      setData(fresh)
    } finally {
      setBusyMapId(null)
    }
  }

  return (
    <Sheet open={gameId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('admin.geoFetch.drawer.title', 'Cartes du jeu')}</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="text-sm text-white/60 py-12 text-center">
            {t('admin.geoFetch.loading', 'Chargement…')}
          </div>
        )}

        {!isLoading && data && data.zones.length === 0 && (
          <div className="rounded-md border border-white/10 bg-black/30 p-8 text-center text-sm text-white/60 mt-4">
            {t(
              'admin.geoFetch.drawer.noCandidates',
              'Aucune carte récupérée pour ce jeu.',
            )}
          </div>
        )}

        {!isLoading && data && data.zones.length > 0 && (
          <div className="space-y-6 mt-4">
            {data.zones.map((zone) => (
              <div key={zone.zoneSlug ?? '__world__'} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white/80">
                    {zone.zoneName ?? t('admin.geoFetch.drawer.worldZone', 'Monde')}
                  </h3>
                  <span className="text-xs text-white/50">
                    {t('admin.geoFetch.drawer.candidateCount', '{{count}} candidate(s)', {
                      count: zone.maps.length,
                    })}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {zone.maps.map((map) => (
                    <div
                      key={map.id}
                      className={`rounded-md border overflow-hidden ${
                        map.isSelected
                          ? 'border-neon-purple ring-1 ring-neon-purple/50'
                          : 'border-white/10'
                      }`}
                    >
                      <div className="aspect-video bg-black/30 relative">
                        <img
                          src={map.imageUrl}
                          alt={map.zoneName ?? ''}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {map.isSelected && (
                          <div className="absolute top-1 left-1 bg-neon-purple/90 rounded p-1">
                            <Star className="h-3 w-3 text-white fill-white" />
                          </div>
                        )}
                      </div>
                      <div className="p-2 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono uppercase text-white/60">
                            {map.provider ?? map.source}
                          </span>
                          <span className="text-white/40">
                            {map.widthPx}×{map.heightPx}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant={map.isSelected ? 'secondary' : 'default'}
                          className="w-full"
                          disabled={map.isSelected || busyMapId === map.id}
                          onClick={() => void handleSelect(map.id)}
                        >
                          {map.isSelected ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              {t('admin.geoFetch.drawer.selected', 'Sélectionnée')}
                            </>
                          ) : (
                            t('admin.geoFetch.drawer.choose', 'Choisir')
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (gameId == null) return
                      void retrySource(gameId, 'fandom')
                    }}
                    title={t('admin.geoFetch.drawer.refetch', 'Re-récupérer')}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {t('admin.geoFetch.drawer.refetch', 'Re-récupérer')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
