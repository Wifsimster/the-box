import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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

export function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000
  
  if (timeTakenSeconds < 3) {
    return 2.0
  } else if (timeTakenSeconds < 5) {
    return 1.75
  } else if (timeTakenSeconds < 10) {
    return 1.5
  } else if (timeTakenSeconds < 20) {
    return 1.25
  } else {
    return 1.0
  }
}
