import { useEffect, useSyncExternalStore } from 'react'
import type { FeatureFlags } from '@/lib/dailyFirst'

/**
 * Runtime feature flags served by `GET /api/features`. The SPA bundle is built
 * once into the Docker image, so build-time VITE_ vars can't reflect
 * per-deployment env flips — the backend tells us which optional surfaces to
 * render.
 *
 * - geoCommunity: community geo surface (free play + contribution) —
 *   GEO_COMMUNITY_ENABLED.
 * - geogamers: GeoGamers ("Panorama") daily mode — GEOGAMERS_ENABLED.
 * - describeGuess: "describe the game" shadow capture is live (Admin →
 *   Paramètres). No player UI; only the privacy page reads it.
 */
export type RuntimeFeatures = FeatureFlags

// Defaults until `/api/features` answers. geoCommunity stays optimistic (a
// failed fetch keeps its entries rather than blanking navigation). Panorama
// starts hidden (D5): its "NEW" entry must not flash on a deployment where
// GEOGAMERS_ENABLED is off, which is the backend default.
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
