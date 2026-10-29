import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GeoPoint } from '@the-box/types'
import { useGeoFreePlayStore } from '@/stores/geoFreePlayStore'
import { useFullscreen } from '@/hooks/useFullscreen'
import { geoApi } from '@/lib/api/geo'
import { GeoPlayDeck } from '@/components/geo/GeoPlayDeck'

function vibrate(pattern: number | number[]): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate(pattern)
        } catch {
        }
    }
}

export default function GeoPlayPage() {
    const { t, i18n } = useTranslation()

    const store = useGeoFreePlayStore()
    const {
        games,
        currentGameId,
        currentMapId,
        maps,
        view,
        pendingGuess,
        phase,
        ignoredGameIds,
        playedByGame,
        loadGames,
        rerollScreenshot,
        pickRandomAcrossGames,
        setPendingGuess,
        submitGuess,
    } = store

    const [gamePickerOpen, setGamePickerOpen] = useState(false)
    const [mapPickerOpen, setMapPickerOpen] = useState(false)
    const [pinsToday, setPinsToday] = useState<number | null>(null)

    const rootRef = useRef<HTMLDivElement>(null)
    const fullscreen = useFullscreen(rootRef)

    useEffect(() => {
        loadGames()
    }, [loadGames])

    useEffect(() => {
        let cancelled = false
        geoApi
            .getTodayStats()
            .then((stats) => {
                if (!cancelled) setPinsToday(stats.totalPinsToday)
            })
            .catch(() => {
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (currentGameId != null && !view && phase === 'idle') {
            void rerollScreenshot()
        }
    }, [currentGameId, view, phase, rerollScreenshot])

    const pinAnnouncement = pendingGuess
        ? t('geo.play.pinPlacedAria', {
              defaultValue: 'Pin placed at {{x}}%, {{y}}%',
              x: Math.round(pendingGuess.x * 100),
              y: Math.round(pendingGuess.y * 100),
          })
        : ''

    const isMultiMap = maps.length > 1
    const selectedMap = useMemo(
        () => maps.find((m) => m.id === currentMapId) ?? null,
        [maps, currentMapId],
    )
    const currentGame = useMemo(
        () => games.find((g) => g.id === currentGameId) ?? null,
        [games, currentGameId],
    )

    const ignoredSet = useMemo(() => new Set(ignoredGameIds), [ignoredGameIds])

    const allGamesCompleted = useMemo(() => {
        const considered = games.filter((g) => !ignoredSet.has(g.id))
        if (considered.length === 0) return false
        return considered.every((g) => {
            const played = playedByGame[g.id]?.length ?? 0
            return g.screenshotCount > 0 && played >= g.screenshotCount
        })
    }, [games, ignoredSet, playedByGame])

    useEffect(() => {
        if (phase === 'exhausted' && !allGamesCompleted) {
            void pickRandomAcrossGames()
        }
    }, [phase, allGamesCompleted, pickRandomAcrossGames])

    const canSubmit =
        phase === 'ready' &&
        !!pendingGuess &&
        !!view &&
        (selectedMap != null || maps.length === 1)

    const handleMapPin = (p: GeoPoint | null) => {
        const wasEmpty = !pendingGuess
        setPendingGuess(p)
        if (p && wasEmpty) vibrate(10)
    }

    const handleSubmit = async () => {
        vibrate([15, 25, 15])
        await submitGuess()
    }

    return (
        <div ref={rootRef} className="bg-background">
            <GeoPlayDeck
                fullscreen={{
                    isImmersive: fullscreen.isImmersive,
                    isSupported: fullscreen.isSupported,
                    onToggle: () => void fullscreen.toggle(),
                }}
                gamePickerOpen={gamePickerOpen}
                setGamePickerOpen={setGamePickerOpen}
                mapPickerOpen={mapPickerOpen}
                setMapPickerOpen={setMapPickerOpen}
                pinAnnouncement={pinAnnouncement}
                pinsToday={pinsToday}
                language={i18n.language}
                currentGame={currentGame}
                selectedMap={selectedMap}
                isMultiMap={isMultiMap}
                allGamesCompleted={allGamesCompleted}
                ignoredSet={ignoredSet}
                canSubmit={canSubmit}
                onMapPin={handleMapPin}
                onSubmit={handleSubmit}
                store={store}
            />
        </div>
    )
}
