import { useEffect, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { useAuth } from '@/hooks/useAuth'
import { gameApi } from '@/lib/api/game'
import type { LetterRevealState } from '@/types'

const LEADING_ARTICLE = /^(?:(?:the|an|a|les|le|la)(?=\s)|l')/i

function firstUnmaskedLetter(mask: string): string | null {
  const article = mask.match(LEADING_ARTICLE)
  const start = article ? article[0].length : 0
  let firstDigit: string | null = null
  for (let i = start; i < mask.length; i++) {
    const ch = mask[i]!
    if (ch === '_') continue
    if (/\p{L}/u.test(ch)) return ch
    if (firstDigit === null && /\d/.test(ch)) firstDigit = ch
  }
  return firstDigit
}

export type LetterRevealStatus =
  | 'hidden'
  | 'locked'
  | 'ready'
  | 'no-inventory'
  | 'cap-reached'

export interface UseLetterRevealResult {
  status: LetterRevealStatus
  letterState: LetterRevealState | null
  isRevealing: boolean
  isRankedDaily: boolean
  inventoryCount: number
  lastRevealedLetter: string | null
  reveal: () => Promise<void>
}

export function useLetterReveal(): UseLetterRevealResult {
  const [isRevealing, setIsRevealing] = useState(false)
  const [lastRevealedLetter, setLastRevealedLetter] = useState<string | null>(null)
  const [todayStr] = useState(() => new Date().toISOString().split('T')[0])

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

  useEffect(() => {
    if (!inventory && session?.user?.id) {
      fetchInventory()
    }
  }, [inventory, session?.user?.id, fetchInventory])

  const [announcedPosition, setAnnouncedPosition] = useState(currentPosition)
  if (announcedPosition !== currentPosition) {
    setAnnouncedPosition(currentPosition)
    setLastRevealedLetter(null)
  }

  const positionState = positionStates[currentPosition]
  const letterState =
    positionState?.letterReveal ??
    (currentScreenshotData?.position === currentPosition
      ? currentScreenshotData?.letterReveal
      : undefined)

  const hidden =
    challengeId === null || gamePhase !== 'playing' || !letterState || !tierSessionId

  const hasIncorrectGuess = positionState?.hasIncorrectGuess || false
  const capReached =
    letterState != null && letterState.lettersRevealed >= letterState.maxLetters

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
      const nextMask = result.maskedTitle
      let revealedChar: string | null = null
      if (previousMask.length === nextMask.length) {
        for (let i = 0; i < nextMask.length; i++) {
          if (previousMask[i] === '_' && nextMask[i] !== '_') {
            revealedChar = nextMask[i]
            break
          }
        }
      } else {
        revealedChar = firstUnmaskedLetter(nextMask)
      }
      if (revealedChar) setLastRevealedLetter(revealedChar)
      setLetterRevealState(currentPosition, result)
      if (result.fromInventory) {
        fetchInventory().catch(console.error)
      }
    } catch (error) {
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
