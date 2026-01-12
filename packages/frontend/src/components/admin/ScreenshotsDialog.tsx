import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { Game, Screenshot } from '@/types'
import { adminApi } from '@/lib/api/admin'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PaginationDots } from '@/components/ui/pagination-dots'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

interface ScreenshotsDialogProps {
  game: Game | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ScreenshotsDialog({ game, open, onOpenChange }: ScreenshotsDialogProps) {
  const { t } = useTranslation()
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [loading, setLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (open && game) {
      setLoading(true)
      setCurrentIndex(0)
      adminApi
        .getGameScreenshots(game.id)
        .then(({ screenshots }) => setScreenshots(screenshots))
        .catch(() => setScreenshots([]))
        .finally(() => setLoading(false))
    }
  }, [open, game])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : screenshots.length - 1))
  }, [screenshots.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < screenshots.length - 1 ? prev + 1 : 0))
  }, [screenshots.length])

  // Keyboard navigation
  useEffect(() => {
    if (!open || screenshots.length <= 1) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, screenshots.length, goToPrevious, goToNext])

  const getDifficultyLabel = (difficulty: number): { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' } => {
    switch (difficulty) {
      case 1:
        return { label: 'Easy', variant: 'success' }
      case 2:
        return { label: 'Medium', variant: 'warning' }
      case 3:
        return { label: 'Hard', variant: 'destructive' }
      default:
        return { label: 'Unknown', variant: 'secondary' }
    }
  }

  const currentScreenshot = screenshots[currentIndex]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {t('admin.games.screenshotsDialog.title', { name: game?.name })}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : screenshots.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {t('admin.games.screenshotsDialog.noScreenshots')}
          </div>
        ) : (
          <div className="relative">
            {/* Main image */}
            <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
              <img
                src={currentScreenshot?.imageUrl}
                alt={`Screenshot ${currentIndex + 1}`}
                className="w-full h-full object-contain"
              />

              {/* Navigation arrows */}
              {screenshots.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white h-10 w-10"
                    onClick={goToPrevious}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white h-10 w-10"
                    onClick={goToNext}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}

              {/* Info overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-4">
                <div className="flex items-center justify-between">
                  {currentScreenshot && (
                    <Badge variant={getDifficultyLabel(currentScreenshot.difficulty).variant}>
                      {t('admin.games.screenshotsDialog.difficulty')}: {getDifficultyLabel(currentScreenshot.difficulty).label}
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
              <span className="text-sm text-muted-foreground">
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
      </DialogContent>
    </Dialog>
  )
}
