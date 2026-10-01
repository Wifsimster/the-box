import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Game, Screenshot } from '@/types'
import { adminApi } from '@/lib/api/admin'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PaginationDots } from '@/components/ui/pagination-dots'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'

interface ScreenshotsDialogProps {
  game: Game | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getDifficultyLabel(
  difficulty: number,
): { labelKey: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' } {
  switch (difficulty) {
    case 1:
      return { labelKey: 'achievements.difficulty.easy', variant: 'success' }
    case 2:
      return { labelKey: 'achievements.difficulty.medium', variant: 'warning' }
    case 3:
      return { labelKey: 'achievements.difficulty.hard', variant: 'destructive' }
    default:
      return { labelKey: 'common.unknown', variant: 'secondary' }
  }
}

export function ScreenshotsDialog({ game, open, onOpenChange }: ScreenshotsDialogProps) {
  const { t } = useTranslation()

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-2xl lg:max-w-4xl">
        <ResponsiveDialogHeader className="pr-10">
          <ResponsiveDialogTitle>
            {t('admin.games.screenshotsDialog.title', { name: game?.name })}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {/* Keying on the game id remounts the viewer per game, giving it fresh
            state (carousel index + loading) without any reset-on-prop effect. */}
        {open && game && <ScreenshotsViewer key={game.id} gameId={game.id} gameName={game.name} />}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

interface ScreenshotsState {
  screenshots: Screenshot[]
  loading: boolean
}

function ScreenshotsViewer({ gameId, gameName }: { gameId: number; gameName: string }) {
  const { t } = useTranslation()
  // `screenshots` and `loading` settle together (one fetch resolves both), so
  // they live in a single state object updated in one set call rather than a
  // cascade of setScreenshots/setLoading writes inside the effect.
  const [{ screenshots, loading }, setState] = useState<ScreenshotsState>({
    screenshots: [],
    loading: true,
  })
  const [currentIndex, setCurrentIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .getGameScreenshots(gameId)
      .then(({ screenshots }) => {
        if (!cancelled) setState({ screenshots, loading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ screenshots: [], loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : screenshots.length - 1))
  }, [screenshots.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : 0))
  }, [screenshots.length])

  // Keyboard navigation
  useEffect(() => {
    if (screenshots.length <= 1) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [screenshots.length, goToPrevious, goToNext])

  const currentScreenshot = screenshots[currentIndex]

  return (
    <>
        {loading ? (
          <div aria-busy="true" className="space-y-4">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="mx-auto h-4 w-24" variant="text" />
          </div>
        ) : screenshots.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <ImageOff className="size-8" aria-hidden="true" />
            {t('admin.games.screenshotsDialog.noScreenshots')}
          </div>
        ) : (
          <div className="relative">
            {/* Main image */}
            <div
              className="relative aspect-video rounded-lg overflow-hidden bg-background touch-pan-y"
              onTouchStart={(e) => {
                touchStartX.current = e.touches[0]?.clientX ?? null
              }}
              onTouchEnd={(e) => {
                const start = touchStartX.current
                touchStartX.current = null
                const end = e.changedTouches[0]?.clientX
                if (start == null || end == null || screenshots.length <= 1) return
                const delta = end - start
                if (Math.abs(delta) < 40) return
                if (delta > 0) goToPrevious()
                else goToNext()
              }}
            >
              <img
                src={currentScreenshot?.imageUrl}
                alt={`${gameName} — ${currentIndex + 1}/${screenshots.length}`}
                className="size-full object-contain"
              />

              {/* Navigation arrows */}
              {screenshots.length > 1 && (
                <>
                  <Button
                    variant="overlay"
                    size="icon"
                    className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2"
                    onClick={goToPrevious}
                    aria-label={t('admin.games.screenshotsDialog.previous')}
                  >
                    <ChevronLeft className="size-5 sm:size-6" />
                  </Button>
                  <Button
                    variant="overlay"
                    size="icon"
                    className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2"
                    onClick={goToNext}
                    aria-label={t('admin.games.screenshotsDialog.next')}
                  >
                    <ChevronRight className="size-5 sm:size-6" />
                  </Button>
                </>
              )}

              {/* Info overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                  {currentScreenshot && (
                    <Badge variant={getDifficultyLabel(currentScreenshot.difficulty).variant}>
                      {t('admin.games.screenshotsDialog.difficulty')} : {t(getDifficultyLabel(currentScreenshot.difficulty).labelKey)}
                    </Badge>
                  )}
                  {currentScreenshot?.locationHint && (
                    <span className="text-xs text-white/70">
                      {currentScreenshot.locationHint}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Counter and dots */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {currentIndex + 1} / {screenshots.length}
              </span>

              <PaginationDots
                total={screenshots.length}
                current={currentIndex}
                onSelect={setCurrentIndex}
              />
            </div>
          </div>
        )}
    </>
  )
}
