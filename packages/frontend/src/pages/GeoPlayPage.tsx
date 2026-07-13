import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GeoPoint } from '@the-box/types'
import { useGeoFreePlayStore } from '@/stores/geoFreePlayStore'
import { useFullscreen } from '@/hooks/useFullscreen'
import { geoApi } from '@/lib/api/geo'
import { GeoPlayDeck } from '@/components/geo/GeoPlayDeck'

/**
 * Free-play geo browser. Pick any game, any map, any time — unranked. The
 * page is mobile-first: a single screenshot↔map deck (swipe / tab to
 * toggle) and a sticky bottom dock for actions. Native fullscreen is the
 * primary feature; on browsers that block it on `<div>` (iOS Safari) we
 * fall back to a CSS-immersive layout that still hides app chrome.
 *
 * Free-play state is held in `useGeoFreePlayStore` and is independent of
 * the daily-challenge store, so a free-play round can never write to the
 * leaderboard or pollute the daily resume.
 */
// Light haptic feedback for the two-step pin flow. Called on the
// initial pin drop (single tick) and again on submit (longer pulse).
// `navigator.vibrate` is a no-op on iOS Safari and any browser without
// the Vibration API — failure is silent and there's nothing to fall
// back to, so we just guard the call.
function vibrate(pattern: number | number[]): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
            navigator.vibrate(pattern)
        } catch {
            /* ignore — Android sometimes throws if the page is hidden */
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
    // Cold-start social proof: count of pins submitted today (UTC).
    // One-shot fetch on mount; null until it lands so the empty state
    // doesn't flash a misleading "0 pins today" placeholder.
    const [pinsToday, setPinsToday] = useState<number | null>(null)

    // Fullscreen target: the entire immersive deck. Putting the wrapper
    // ref on the outer container means the screenshot, map, dock and
    // overlays all enter fullscreen together.
    const rootRef = useRef<HTMLDivElement>(null)
    const fullscreen = useFullscreen(rootRef)

    // Boot: hydrate the games list (cached for 5 min) and, if the user
    // had a game selected last session, auto-load a screenshot for it.
    useEffect(() => {
        loadGames()
    }, [loadGames])

    // Boot: pull the dataset social-proof counter. Failure is silent —
    // the empty state degrades gracefully when this number is null.
    useEffect(() => {
        let cancelled = false
        geoApi
            .getTodayStats()
            .then((stats) => {
                if (!cancelled) setPinsToday(stats.totalPinsToday)
            })
            .catch(() => {
                /* ignore — counter is decorative, not blocking */
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

    // Screen-reader announcement for the placed pin. Derived directly
    // from `pendingGuess` so the live region updates on the same render
    // that drops the pin — no useState/useEffect dance, no cascading
    // re-renders, no risk of stale strings (cf. WCAG 2.4.6 / 4.1.3).
    const pinAnnouncement = pendingGuess
        ? t('geo.play.pinPlacedAria', {
              defaultValue: 'Pin placed at {{x}}%, {{y}}%',
              x: Math.round(pendingGuess.x * 100),
              y: Math.round(pendingGuess.y * 100),
          })
        : ''

    // Fresh visitors with no selection land on the full-deck welcome
    // hero (see GeoWelcome), which carries the pitch and the entry
    // points — no picker sheet is auto-opened over them anymore.
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

    // "All-time done" — true when every catalog game the player hasn't
    // ignored has its full set of screenshots already played. Computed
    // from local state (playedByGame) plus the catalog `screenshotCount`,
    // so it stays accurate as the catalog grows.
    const allGamesCompleted = useMemo(() => {
        const considered = games.filter((g) => !ignoredSet.has(g.id))
        if (considered.length === 0) return false
        return considered.every((g) => {
            const played = playedByGame[g.id]?.length ?? 0
            return g.screenshotCount > 0 && played >= g.screenshotCount
        })
    }, [games, ignoredSet, playedByGame])

    // When the current game runs out of captures but the catalog still has
    // unplayed screenshots elsewhere, silently switch to another game
    // instead of showing a per-game "you've seen everything" notice.
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

    // Two-step pin: first map tap drops a draft (light tick), then the
    // dock CTA confirms (longer pulse). Haptics are a no-op on iOS Safari
    // and any browser without the Vibration API.
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
