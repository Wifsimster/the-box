import { useEffect } from 'react'

const STORAGE_KEY = 'thebox.referral'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface StoredReferral {
  code: string
  capturedAt: number
}

export function readStoredReferral(): StoredReferral | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredReferral
    if (Date.now() - parsed.capturedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

// Captures a `?ref=<code>` query param on page load and persists it in
// localStorage so later signup attribution can read it. Only the first
// referral is stored — re-landing with a new ref does not overwrite.
export function useReferralCapture(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const code = params.get('ref')?.trim()
    if (!code) return

    const existing = readStoredReferral()
    if (existing) return

    const payload: StoredReferral = { code, capturedAt: Date.now() }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // localStorage may be unavailable (private mode, quota) — silently ignore
    }
  }, [])
}
