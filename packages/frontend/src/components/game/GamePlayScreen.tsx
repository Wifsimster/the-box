import { m, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { ScreenshotViewer } from '@/components/game/ScreenshotViewer'
import { GuessInput } from '@/components/game/GuessInput'
import { SecondChanceModal } from '@/components/game/SecondChanceModal'
import { ScoreDisplay } from '@/components/game/ScoreDisplay'
import { ResultCard } from '@/components/game/ResultCard'
import { CompletionChoiceModal } from '@/components/game/CompletionChoiceModal'
import { ProgressDots } from '@/components/game/ProgressDots'
import { EndGameButton } from '@/components/game/EndGameButton'
import { CountdownTimer } from '@/components/game/CountdownTimer'
import { useRoundTimer } from '@/hooks/useCountdownTimer'
import { ReportCaptureDialog } from '@/components/ReportCaptureDialog'

export function GamePlayScreen({
  showResult,
  currentImageUrl,
  currentScreenshotId,
  isAuthenticated,
  isKeyboardOpen,
}: {
  showResult: boolean
  currentImageUrl: string | null | undefined
  currentScreenshotId: number | undefined
  isAuthenticated: boolean
  isKeyboardOpen: boolean
}) {
  const timer = useRoundTimer()

  return (
    <m.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative size-full flex flex-col"
    >
      <div className="absolute left-2 top-2 z-40 sm:left-4 sm:top-4">
        <CountdownTimer state={timer} />
      </div>

      <div className="absolute right-2 top-2 z-40 flex min-w-28 flex-col items-stretch sm:right-4 sm:top-4 sm:min-w-36">
        <div className="bg-background/70 backdrop-blur-md rounded-t-xl last:rounded-b-xl px-4 sm:px-6 py-1.5 sm:py-2.5 border border-border/60 shadow-2xl">
          <ScoreDisplay />
        </div>
        <EndGameButton />
      </div>

      {currentImageUrl && (
        <m.div
          className="absolute inset-0 size-full z-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <img
            src={currentImageUrl}
            alt=""
            className="size-full object-cover blur-3xl opacity-20 scale-110"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-linear-to-br from-neon-purple/10 via-transparent to-neon-pink/10 pointer-events-none" />
        </m.div>
      )}

      <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center">
        {currentImageUrl ? (
          <ScreenshotViewer imageUrl={currentImageUrl} className="size-full min-h-0" />
        ) : (
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        )}
        {currentScreenshotId && (
          <div className="absolute bottom-2 right-2 z-30">
            <ReportCaptureDialog
              target={{ screenshotId: currentScreenshotId }}
              isAuthenticated={isAuthenticated}
              iconOnly
              triggerClassName="size-11 p-0 rounded-full bg-background/60 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-background/80"
            />
          </div>
        )}
      </div>

      <div
        className="relative z-20 bg-linear-to-t from-background/95 via-background/90 to-transparent pt-3 md:pt-4 px-2 sm:px-3 md:px-4"
        style={{
          paddingBottom: isKeyboardOpen
            ? '0.5rem'
            : 'max(0.5rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto w-full max-w-2xl space-y-2 sm:space-y-3">
          {!isKeyboardOpen && (
            <div className="flex justify-center items-center">
              <ProgressDots />
            </div>
          )}
          <GuessInput />
        </div>
        <SecondChanceModal />
      </div>

      <AnimatePresence>{showResult && <ResultCard />}</AnimatePresence>

      <CompletionChoiceModal />
    </m.div>
  )
}
