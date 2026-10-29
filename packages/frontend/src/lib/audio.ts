let audioContext: AudioContext | null = null

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

function playSynthesizedAchievementSound(volume = 0.5): void {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime

    const frequencies = [523.25, 783.99]

    frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(freq, now)

      const startTime = now + i * 0.1
      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(volume * 0.4, startTime + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5)

      oscillator.start(startTime)
      oscillator.stop(startTime + 0.5)
    })
  } catch {
  }
}

const SOUNDS = {
  ACHIEVEMENT_UNLOCK: '/sounds/achievement-unlock.mp3',
} as const

export async function playAchievementSound(): Promise<void> {
  const audio = new Audio(SOUNDS.ACHIEVEMENT_UNLOCK)

  return new Promise((resolve) => {
    audio.volume = 0.6

    audio.oncanplaythrough = () => {
      audio.play().then(() => {
        audio.onended = () => resolve()
      }).catch(() => {
        playSynthesizedAchievementSound(0.5)
        resolve()
      })
    }

    audio.onerror = () => {
      playSynthesizedAchievementSound(0.5)
      resolve()
    }

    setTimeout(() => {
      playSynthesizedAchievementSound(0.5)
      resolve()
    }, 200)

    audio.load()
  })
}
