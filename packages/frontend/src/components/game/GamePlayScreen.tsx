import { m, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { ScreenshotViewer } from '@/components/game/ScreenshotViewer'
import { GuessInput } from '@/components/game/GuessInput'
import { HintButtons } from '@/components/game/HintButtons'
import { MaskedTitle } from '@/components/game/MaskedTitle'
import { SecondChanceModal } from '@/components/game/SecondChanceModal'
import { ScoreDisplay } from '@/components/game/ScoreDisplay'
import { ResultCard } from '@/components/game/ResultCard'
import { CompletionChoiceModal } from '@/components/game/CompletionChoiceModal'
import { ProgressDots } from '@/components/game/ProgressDots'
import { EndGameButton } from '@/components/game/EndGameButton'
import { CountdownTimer } from '@/components/game/CountdownTimer'
import { useRoundTimer } from '@/hooks/useCountdownTimer'
import { ReportCaptureDialog } from '@/components/ReportCaptureDialog'

/**
 * The active daily-game surface: blurred backdrop, screenshot viewer, score
 * + end-game controls and the guess input dock. Extracted from GamePage so
 * that component focuses on game-loop orchestration rather than layout.
 */
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
  // Per-screenshot countdown. The hook also owns the timeout side-effect
  // (lock the screenshot as a permanent miss and advance) when time runs out.
  const timer = useRoundTimer()

  return (
    <m.div
      key="game"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative size-full flex flex-col"
    >
      {/* Round Countdown Timer (Top Left) — mirrors the score panel shell. */}
      <div
        className="absolute left-2 sm:left-4 z-40"
        style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <CountdownTimer state={timer} />
      </div>

      {/* Score and End Game Button (Top Right) */}
      <div
        className="absolute right-2 sm:right-4 z-40 flex flex-col items-stretch min-w-28 sm:min-w-36"
        style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <div className="bg-black/60 backdrop-blur-md rounded-t-xl px-4 sm:px-6 py-1.5 sm:py-2.5 border border-white/10 shadow-2xl">
          <ScoreDisplay />
        </div>
        <EndGameButton />
      </div>

      {/* Dynamic Blurred Background Layer */}
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
          {/* Gradient overlays for ambient effect */}
          <div className="absolute inset-0 bg-linear-to-br from-neon-purple/10 via-transparent to-neon-pink/10 pointer-events-none" />
        </m.div>
      )}

      {/* Screenshot Viewer — flex-1 so it fills all space above the dock.
          When the layout viewport shrinks (Android keyboard) or we add
          padding-bottom on the outer container (iOS keyboard), this area
          shrinks naturally and the screenshot stays visible. */}
      <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center">
        {currentImageUrl ? (
          <ScreenshotViewer imageUrl={currentImageUrl} className="size-full min-h-0" />
        ) : (
          <Loader2 className="size-8 animate-spin text-primary" />
        )}
        {/* Report button — overlay on the viewer; only shown while we
            have a real screenshot in play. Pinned to the bottom-right
            to avoid overlapping the score panel (z-40) at the top. */}
        {currentScreenshotId && (
          <div className="absolute bottom-2 right-2 z-30">
            <ReportCaptureDialog
              target={{ screenshotId: currentScreenshotId }}
              isAuthenticated={isAuthenticated}
              iconOnly
              triggerClassName="size-8 p-0 rounded-full bg-background/60 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-background/80"
            />
          </div>
        )}
      </div>

      {/* Guess Input Dock — normal flow, pinned at bottom via flex-col. */}
      <div
        className="relative z-20 bg-linear-to-t from-background/95 via-background/90 to-transparent pt-3 md:pt-4 px-2 sm:px-3 md:px-4"
        style={{
          paddingBottom: isKeyboardOpen
            ? '0.5rem'
            : 'max(0.5rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="container mx-auto space-y-2 sm:space-y-3 md:space-y-4">
          <MaskedTitle />
          <HintButtons />
          <div className="flex justify-center items-center">
            <ProgressDots />
          </div>
          <GuessInput />
        </div>
        <SecondChanceModal />
      </div>

      {/* Result Card Overlay */}
      <AnimatePresence>{showResult && <ResultCard />}</AnimatePresence>

      {/* Completion Choice Modal */}
      <CompletionChoiceModal />
    </m.div>
  )
}
