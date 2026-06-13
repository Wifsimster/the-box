import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Cookie / tracking consent (GDPR / RGPD).
 *
 * Three categories:
 *  - Essential — always on, not represented here (auth/session cookies are
 *    strictly necessary and exempt from consent).
 *  - Analytics — gates GoatCounter pageview tracking.
 *  - Support — gates the Koe feedback widget.
 *
 * `null` means "the user hasn't decided yet". Once they pick anything,
 * `decided` flips true and the banner stops showing. State is persisted to
 * localStorage so the choice survives reloads.
 */
interface ConsentState {
  analytics: boolean | null
  support: boolean | null
  decided: boolean

  acceptAll: () => void
  rejectNonEssential: () => void
  setPreferences: (prefs: { analytics: boolean; support: boolean }) => void
}

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      analytics: null,
      support: null,
      decided: false,

      acceptAll: () => set({ analytics: true, support: true, decided: true }),
      rejectNonEssential: () =>
        set({ analytics: false, support: false, decided: true }),
      setPreferences: ({ analytics, support }) =>
        set({ analytics, support, decided: true }),
    }),
    {
      name: 'the-box-consent',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/**
 * Selector: should the consent banner be shown? True until the user has made
 * an explicit choice.
 */
export const selectShouldShowConsentBanner = (state: ConsentState): boolean =>
  !state.decided
