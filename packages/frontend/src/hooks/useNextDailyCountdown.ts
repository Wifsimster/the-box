import { useEffect, useState } from 'react'

interface TimeRemaining {
  hours: number
  minutes: number
  seconds: number
  totalSeconds: number
}

export function useNextDailyCountdown() {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() => calculateTimeUntilNextDaily())

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeUntilNextDaily())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return timeRemaining
}

function calculateTimeUntilNextDaily(): TimeRemaining {
  const now = new Date()
  const nextMidnight = new Date(now)

  nextMidnight.setUTCHours(24, 0, 0, 0)

  const diffMs = nextMidnight.getTime() - now.getTime()
  const totalSeconds = Math.floor(diffMs / 1000)

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return {
    hours,
    minutes,
    seconds,
    totalSeconds
  }
}
