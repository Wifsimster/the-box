import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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

export const selectShouldShowConsentBanner = (state: ConsentState): boolean =>
  !state.decided
