import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Drives the "What's New" changelog dialog.
 *
 * `lastSeenVersion` is the newest *announced* release (a `CHANGELOG` registry
 * entry, not the build version) this browser has acknowledged. It is persisted
 * to localStorage so a release's notes auto-open exactly once — the first load
 * after that release is announced. Build versions bump on every deploy, so
 * keying on them would re-open the dialog after each deploy; the registry only
 * moves when there is genuinely something new to read. `open` is ephemeral UI
 * state: the dialog flips it on automatically after a new announcement, and
 * the footer version chip can flip it on manually to re-read the notes any
 * time.
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
