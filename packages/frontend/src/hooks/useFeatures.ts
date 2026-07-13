import { useEffect, useSyncExternalStore } from 'react'

/**
 * Runtime feature flags served by `GET /api/features`. The SPA bundle is built
 * once into the Docker image, so build-time VITE_ vars can't reflect
 * per-deployment env flips — the backend tells us which optional surfaces to
 * render.
 */
export interface RuntimeFeatures {
  /** Community geo surface (free play + contribution) — GEO_COMMUNITY_ENABLED. */
  geoCommunity: boolean
  /** GeoGamers daily mode — GEOGAMERS_ENABLED. */
  geogamers: boolean
}

// Optimistic defaults matching the backend flag defaults: geoCommunity ships
// on. A deployment that turned it off hides the entries right after the
// (cached, 60s) fetch resolves; a failed fetch keeps current behavior rather
// than blanking navigation.
const DEFAULT_FEATURES: RuntimeFeatures = { geoCommunity: true, geogamers: true }

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
    }
    listeners.forEach((l) => l())
  } catch {
    // Network failure: keep the optimistic defaults.
  }
}

/**
 * Subscribe to the runtime feature flags. Fetched once per page load, shared
 * across every consumer (Header, home cards, …).
 */
export function useFeatures(): RuntimeFeatures {
  useEffect(() => {
    if (!fetchStarted) {
      fetchStarted = true
      void fetchFeatures()
    }
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
