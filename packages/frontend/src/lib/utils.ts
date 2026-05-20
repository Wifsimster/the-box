import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a duration in milliseconds for display next to a guess result.
 * Returns "1.2s" under a minute, "1m23s" beyond.
 */
export function formatDiscoveryTime(timeTakenMs: number): string {
  if (!Number.isFinite(timeTakenMs) || timeTakenMs <= 0) return "0s"
  const totalSeconds = timeTakenMs / 1000
  if (totalSeconds < 60) {
    return totalSeconds < 10
      ? `${totalSeconds.toFixed(1)}s`
      : `${Math.round(totalSeconds)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds - minutes * 60)
  return seconds === 0 ? `${minutes}m` : `${minutes}m${seconds}s`
}

/**
 * Calculate speed multiplier based on time taken to find the screenshot
 * Matches the backend logic in game.service.ts
 * @param timeTakenMs Time in milliseconds from screenshot shown to correct guess
 * @returns Multiplier value (1.0 to 2.0)
 */
export function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000
  
  if (timeTakenSeconds < 3) {
    return 2.0 // 200 points
  } else if (timeTakenSeconds < 5) {
    return 1.75 // 175 points
  } else if (timeTakenSeconds < 10) {
    return 1.5 // 150 points
  } else if (timeTakenSeconds < 20) {
    return 1.25 // 125 points
  } else {
    return 1.0 // 100 points
  }
}
