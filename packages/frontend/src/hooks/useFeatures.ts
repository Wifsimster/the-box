import { useEffect, useSyncExternalStore } from 'react'
import type { FeatureFlags } from '@/lib/dailyFirst'

export type RuntimeFeatures = FeatureFlags

const DEFAULT_FEATURES: RuntimeFeatures = { geoCommunity: true, geogamers: false, describeGuess: false }

let snapshot: RuntimeFeatures = DEFAULT_FEATURES
let fetchStarted = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): RuntimeFeatures {
  return snapshot
}

async function fetchFeatures(): Promise<void> {
  try {
    const res = await fetch('/api/features', { credentials: 'include' })
    if (!res.ok) return
    const json = (await res.json()) as {
      success?: boolean
      data?: Partial<RuntimeFeatures>
    }
    if (!json.success || !json.data) return
    snapshot = {
      geoCommunity: json.data.geoCommunity ?? DEFAULT_FEATURES.geoCommunity,
      geogamers: json.data.geogamers ?? DEFAULT_FEATURES.geogamers,
      describeGuess: json.data.describeGuess === true,
    }
    listeners.forEach((l) => l())
  } catch {
  }
}

export function useFeatures(): RuntimeFeatures {
  useEffect(() => {
    if (!fetchStarted) {
      fetchStarted = true
      void fetchFeatures()
    }
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
