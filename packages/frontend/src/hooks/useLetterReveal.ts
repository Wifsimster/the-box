import { useEffect, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useAuth } from '@/hooks/useAuth'
import { gameApi } from '@/lib/api/game'
import type { LetterRevealState } from '@/types'

export type LetterRevealStatus =
  | 'hidden'
  | 'locked'
  | 'ready'
  | 'no-inventory'
  | 'cap-reached'

export interface UseLetterRevealResult {
  /**
   * - 'hidden': not in a daily challenge / not playing / no mask state yet
   * - 'locked': server gate not open yet (no wrong guess on this position)
   * - 'ready': a reveal is possible right now
   * - 'no-inventory': ranked daily with zero `hint_letter` items
   * - 'cap-reached': every revealable letter has been bought
   */
  status: LetterRevealStatus
  /** Mask state for the current position; null while status is 'hidden'. */
  letterState: LetterRevealState | null
  isRevealing: boolean
  /** Mirror of the server's catch-up rule: only today's challenge is inventory-gated. */
  isRankedDaily: boolean
  /** `hint_letter` items currently held. */
  inventoryCount: number
  /**
   * The letter uncovered by the most recent reveal on the current position
   * (diffed client-side from the previous vs next maskedTitle), for the
   * polite live-region announcement. Reset on position change.
   */
  lastRevealedLetter: string | null
  reveal: () => Promise<void>
}

/**
 * Masked-title letter-reveal logic for the daily challenge.
 *
 * Everything that matters is server-authoritative — the gate (one wrong
 * guess first), the per-title cap, the inventory consumption on the ranked
 * daily and the score penalty are all enforced by POST /reveal-letter;
 * this hook only mirrors those rules for affordance.
 *
 * Also owns the fetch-inventory-on-mount effect (previously living in the
 * retired HintButtons component) — without it the ranked-daily inventory
 * gate would silently read a never-loaded inventory.
 */
export function useLetterReveal(): UseLetterRevealResult {
  const [isRevealing, setIsRevealing] = useState(false)
  const [lastRevealedLetter, setLastRevealedLetter] = useState<string | null>(null)

  const { session } = useAuth()
  const { inventory, fetchInventory } = useDailyLoginStore()
  const inventoryCount = inventory?.powerups?.hint_letter ?? 0

  const {
    gamePhase,
    challengeId,
    challengeDate,
    tierSessionId,
    currentPosition,
    currentScreenshotData,
    positionStates,
    setLetterRevealState,
  } = useGameStore()

  // Fetch inventory on mount if not loaded — the inventory gate below
  // depends on it.
  useEffect(() => {
    if (!inventory && session?.user?.id) {
      fetchInventory()
    }
  }, [inventory, session?.user?.id, fetchInventory])

  // A reveal announcement belongs to the position it happened on; clear it
  // when the player navigates away so the live region never replays stale
  // content against another mask.
  useEffect(() => {
    setLastRevealedLetter(null)
  }, [currentPosition])

  const positionState = positionStates[currentPosition]
  // Position-state copy wins (updated after each reveal); the screenshot
  // payload seeds it on fetch.
  const letterState =
    positionState?.letterReveal ??
    (currentScreenshotData?.position === currentPosition
      ? currentScreenshotData?.letterReveal
      : undefined)

  // Daily challenge only, while playing, with a server-provided mask.
  const hidden =
    challengeId === null || gamePhase !== 'playing' || !letterState || !tierSessionId

  const hasIncorrectGuess = positionState?.hasIncorrectGuess || false
  const capReached =
    letterState != null && letterState.lettersRevealed >= letterState.maxLetters

  // Mirror of the server's catch-up rule: only today's challenge is the
  // ranked daily, and only the ranked daily is inventory-gated.
  const todayStr = new Date().toISOString().split('T')[0]
  const isRankedDaily = challengeDate === todayStr
  const missingInventory = isRankedDaily && inventoryCount === 0

  let status: LetterRevealStatus
  if (hidden) {
    status = 'hidden'
  } else if (capReached) {
    status = 'cap-reached'
  } else if (!hasIncorrectGuess) {
    status = 'locked'
  } else if (missingInventory) {
    status = 'no-inventory'
  } else {
    status = 'ready'
  }

  const reveal = async () => {
    if (status !== 'ready' || isRevealing || !tierSessionId || !letterState) return
    setIsRevealing(true)
    try {
      const previousMask = letterState.maskedTitle
      const result = await gameApi.revealLetter({
        tierSessionId,
        position: currentPosition,
      })
      // Diff old vs new mask to find the letter this reveal uncovered —
      // a reveal flips one or more '_' into the same character.
      const nextMask = result.maskedTitle
      let revealedChar: string | null = null
      for (let i = 0; i < nextMask.length; i++) {
        if (previousMask[i] === '_' && nextMask[i] !== '_') {
          revealedChar = nextMask[i]
          break
        }
      }
      if (revealedChar) setLastRevealedLetter(revealedChar)
      setLetterRevealState(currentPosition, result)
      if (result.fromInventory) {
        fetchInventory().catch(console.error)
      }
    } catch (error) {
      // Server is authoritative — a 402/409 here just means our local
      // mirror of the gate was stale; the button state will catch up.
      console.error('Letter reveal failed:', error)
    } finally {
      setIsRevealing(false)
    }
  }

  return {
    status,
    letterState: hidden ? null : (letterState as LetterRevealState),
    isRevealing,
    isRankedDaily,
    inventoryCount,
    lastRevealedLetter,
    reveal,
  }
}
