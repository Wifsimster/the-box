import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Map as MapIcon } from 'lucide-react'
import { useGeoFetchStore } from '@/stores/geoFetchStore'
import { getAdminSocket } from '@/lib/socket'
import { GeoFetchProgressHeader } from './GeoFetchProgressHeader'
import { GeoFetchControls } from './GeoFetchControls'
import { GeoFetchGameList } from './GeoFetchGameList'
import { GameMapsDrawer } from './GameMapsDrawer'

// Top-level container for the geo-fetch admin tab. Owns socket subscription,
// initial hydrate, and which game (if any) is open in the curation drawer.

export default function GeoFetchPanel() {
  const { t } = useTranslation()
  const { hydrate, applyProgress, applyGameDone, applyMapSelected } = useGeoFetchStore()
  const [openGameId, setOpenGameId] = useState<number | null>(null)

  // Initial load + reconnect reconciliation.
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Socket-pushed delta application. Re-hydrate on reconnect to sync drift.
  useEffect(() => {
    const socket = getAdminSocket()
    const onProgress = (payload: { gameId: number; source: string; stage: string }) =>
      applyProgress(payload)
    const onGameDone = (payload: {
      gameId: number
      mapsFound: number
      zonesTotal: number
      finalStage: string
    }) => applyGameDone(payload)
    const onMapSelected = (payload: { gameId: number; mapId: number }) =>
      applyMapSelected(payload)
    const onReconnect = () => {
      void hydrate()
    }

    socket.on('geo:fetch:progress', onProgress)
    socket.on('geo:fetch:gameDone', onGameDone)
    socket.on('geo:fetch:mapSelected', onMapSelected)
    socket.on('reconnect', onReconnect)

    return () => {
      socket.off('geo:fetch:progress', onProgress)
      socket.off('geo:fetch:gameDone', onGameDone)
      socket.off('geo:fetch:mapSelected', onMapSelected)
      socket.off('reconnect', onReconnect)
    }
  }, [hydrate, applyProgress, applyGameDone, applyMapSelected])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapIcon className="h-5 w-5 text-neon-purple" />
        <h2 className="text-xl font-semibold">{t('admin.geoFetch.title', 'Cartes des jeux')}</h2>
      </div>

      <GeoFetchProgressHeader />
      <GeoFetchControls />
      <GeoFetchGameList onOpenGame={setOpenGameId} />

      <GameMapsDrawer
        gameId={openGameId}
        onClose={() => setOpenGameId(null)}
      />
    </div>
  )
}
