import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Drives the "What's New" changelog dialog.
 *
 * `lastSeenVersion` is persisted to localStorage so a release's notes auto-open
 * exactly once — the first time a player runs that build. `open` is ephemeral
 * UI state: the dialog flips it on automatically after an update, and the footer
 * version chip can flip it on manually to re-read the latest notes any time.
 *
 * `null` for `lastSeenVersion` means "this browser has never recorded a
 * version" (a brand-new visitor). We intentionally don't pop the changelog at
 * someone on their very first visit — `markSeen` is called silently in that
 * case so they only ever see notes for genuine *updates*.
 */
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
      // Only the seen marker needs to survive reloads; `open` is derived.
      partialize: (state) => ({ lastSeenVersion: state.lastSeenVersion }),
    },
  ),
)

/** Selector hook that returns the imperative "open the changelog" action. */
export function useOpenChangelog(): () => void {
  return useChangelogStore((s) => s.openChangelog)
}
