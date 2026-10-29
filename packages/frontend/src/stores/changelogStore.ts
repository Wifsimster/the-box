import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface ChangelogState {
  open: boolean
  lastSeenVersion: string | null
  openChangelog: () => void
  closeChangelog: () => void
  markSeen: (version: string) => void
}

export const useChangelogStore = create<ChangelogState>()(
  persist(
    (set) => ({
      open: false,
      lastSeenVersion: null,
      openChangelog: () => set({ open: true }),
      closeChangelog: () => set({ open: false }),
      markSeen: (version: string) =>
        set({ open: false, lastSeenVersion: version }),
    }),
    {
      name: 'the-box-changelog',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lastSeenVersion: state.lastSeenVersion }),
    },
  ),
)

export function useOpenChangelog(): () => void {
  return useChangelogStore((s) => s.openChangelog)
}
