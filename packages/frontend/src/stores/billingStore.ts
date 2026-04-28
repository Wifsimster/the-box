import { create } from 'zustand'
import type { BillingEntitlement, BillingPrice, BillingTier } from '@the-box/types'

interface BillingState {
  prices: BillingPrice[]
  pricesLoaded: boolean
  entitlement: BillingEntitlement | null
  isLoadingEntitlement: boolean
  isStartingCheckout: boolean
  isOpeningPortal: boolean

  fetchPrices: () => Promise<void>
  fetchEntitlement: () => Promise<void>
  startCheckout: (tier: BillingTier) => Promise<{ url: string } | { error: string }>
  openPortal: () => Promise<{ url: string } | { error: string }>
  reset: () => void
}

const FREE_ENTITLEMENT: BillingEntitlement = {
  isPremium: false,
  tier: null,
  validUntil: null,
  cancelAtPeriodEnd: false,
  source: null,
}

export const useBillingStore = create<BillingState>((set) => ({
  prices: [],
  pricesLoaded: false,
  entitlement: null,
  isLoadingEntitlement: false,
  isStartingCheckout: false,
  isOpeningPortal: false,

  fetchPrices: async () => {
    try {
      const response = await fetch('/api/billing/prices', {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to load prices')
      const json = await response.json()
      set({ prices: json.data?.prices ?? [], pricesLoaded: true })
    } catch (error) {
      console.error('Failed to load billing prices:', error)
      set({ pricesLoaded: true })
    }
  },

  fetchEntitlement: async () => {
    set({ isLoadingEntitlement: true })
    try {
      const response = await fetch('/api/billing/me', {
        credentials: 'include',
      })
      if (response.status === 401) {
        // Anonymous visitors are simply free; not an error worth surfacing.
        set({ entitlement: FREE_ENTITLEMENT, isLoadingEntitlement: false })
        return
      }
      if (!response.ok) throw new Error('Failed to load entitlement')
      const json = await response.json()
      set({ entitlement: json.data as BillingEntitlement, isLoadingEntitlement: false })
    } catch (error) {
      console.error('Failed to load billing entitlement:', error)
      set({ entitlement: FREE_ENTITLEMENT, isLoadingEntitlement: false })
    }
  },

  startCheckout: async (tier: BillingTier) => {
    set({ isStartingCheckout: true })
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const json = await response.json()
      if (!response.ok || !json.success) {
        const code = json?.error?.code ?? 'CHECKOUT_FAILED'
        return { error: code }
      }
      return { url: json.data.url as string }
    } catch (error) {
      console.error('Checkout request failed:', error)
      return { error: 'NETWORK_ERROR' }
    } finally {
      set({ isStartingCheckout: false })
    }
  },

  openPortal: async () => {
    set({ isOpeningPortal: true })
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      })
      const json = await response.json()
      if (!response.ok || !json.success) {
        const code = json?.error?.code ?? 'PORTAL_FAILED'
        return { error: code }
      }
      return { url: json.data.url as string }
    } catch (error) {
      console.error('Portal request failed:', error)
      return { error: 'NETWORK_ERROR' }
    } finally {
      set({ isOpeningPortal: false })
    }
  },

  reset: () =>
    set({
      entitlement: null,
      isLoadingEntitlement: false,
      isStartingCheckout: false,
      isOpeningPortal: false,
    }),
}))
