/**
 * Audio utility for playing sounds in the application
 */

// Cache for preloaded audio elements
const audioCache = new Map<string, HTMLAudioElement>()

// Web Audio API context (lazy initialized)
let audioContext: AudioContext | null = null

/**
 * Get or create the AudioContext
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return audioContext
}

/**
 * Preload an audio file to avoid delay on first play
 */
export function preloadAudio(src: string): void {
  if (audioCache.has(src)) return

  const audio = new Audio(src)
  audio.preload = 'auto'
  audioCache.set(src, audio)
}

/**
 * Play a sound effect from file
 * @param src - Path to the audio file (relative to public folder)
 * @param volume - Volume level from 0 to 1 (default: 0.5)
 */
export function playSound(src: string, volume = 0.5): Promise<void> {
  return new Promise((resolve) => {
    try {
      // Use cached audio or create new instance
      let audio = audioCache.get(src)

      if (audio) {
        // Clone the audio to allow overlapping sounds
        audio = audio.cloneNode() as HTMLAudioElement
      } else {
        audio = new Audio(src)
      }

      audio.volume = Math.max(0, Math.min(1, volume))
      audio.onended = () => resolve()
      audio.onerror = () => resolve()

      audio.play().catch(() => {
        // Silently fail - browser may block autoplay
        resolve()
      })
    } catch {
      // Silently fail for audio errors
      resolve()
    }
  })
}

/**
 * Play a synthesized achievement unlock sound using Web Audio API
 * This provides a pleasant "ding" sound without requiring an audio file
 */
export function playSynthesizedAchievementSound(volume = 0.5): void {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime

    // Create a pleasant "achievement" ding (two-note ascending chime)
    const frequencies = [523.25, 783.99] // C5, G5

    frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(freq, now)

      // Envelope: quick attack, sustain, decay
      const startTime = now + i * 0.1
      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(volume * 0.4, startTime + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5)

      oscillator.start(startTime)
      oscillator.stop(startTime + 0.5)
    })
  } catch {
    // Silently fail
  }
}

// Sound effect paths
export const SOUNDS = {
  ACHIEVEMENT_UNLOCK: '/sounds/achievement-unlock.mp3',
} as const

/**
 * Play the achievement unlock sound
 * Tries the audio file first, falls back to synthesized sound
 */
export async function playAchievementSound(): Promise<void> {
  // Try to play the audio file
  const audio = new Audio(SOUNDS.ACHIEVEMENT_UNLOCK)

  return new Promise((resolve) => {
    audio.volume = 0.6

    audio.oncanplaythrough = () => {
      audio.play().then(() => {
        audio.onended = () => resolve()
      }).catch(() => {
        // Fallback to synthesized sound
        playSynthesizedAchievementSound(0.5)
        resolve()
      })
    }

    audio.onerror = () => {
      // Fallback to synthesized sound if file doesn't exist
      playSynthesizedAchievementSound(0.5)
      resolve()
    }

    // Timeout fallback
    setTimeout(() => {
      playSynthesizedAchievementSound(0.5)
      resolve()
    }, 200)

    audio.load()
  })
}
