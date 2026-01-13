import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate speed multiplier based on time taken to find the screenshot
 * Matches the backend logic in game.service.ts
 * @param timeTakenMs Time in milliseconds from screenshot shown to correct guess
 * @returns Multiplier value (1.0 to 2.0)
 */
export function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000
  
  if (timeTakenSeconds < 5) {
    return 2.0 // 100 points
  } else if (timeTakenSeconds < 15) {
    return 1.5 // 75 points
  } else if (timeTakenSeconds < 30) {
    return 1.2 // 60 points
  } else {
    return 1.0 // 50 points
  }
}
