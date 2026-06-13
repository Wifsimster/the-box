import { useEffect, useMemo, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Wrench, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChangelogStore } from '@/stores/changelogStore'
import {
  CHANGELOG_SECTIONS,
  compareVersions,
  getLatestRelease,
  type ChangelogSection,
} from '@/data/changelog'

/** Build-time version of the running bundle (see vite.config.ts). */
const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

/** Localized i18n shape for a single release block. */
interface ReleaseContent {
  summary?: string
  features?: string[]
  improvements?: string[]
  fixes?: string[]
}

const SECTION_ICONS: Record<
  ChangelogSection,
  typeof Sparkles
> = {
  features: Sparkles,
  improvements: Zap,
  fixes: Wrench,
}

const SECTION_ACCENT: Record<ChangelogSection, string> = {
  features: 'text-primary',
  improvements: 'text-neon-pink',
  fixes: 'text-muted-foreground',
}

/**
 * "What's New" dialog. Surfaces the newest release's notes once after the app
 * updates to that version, and on demand when opened from the footer version
 * chip. All copy is localized; the bullet content comes from the active i18n
 * bundle keyed by version, so it follows the player's language.
 */
export function ChangelogDialog(): ReactElement | null {
  const { t, i18n } = useTranslation()
  const open = useChangelogStore((s) => s.open)
  const lastSeenVersion = useChangelogStore((s) => s.lastSeenVersion)
  const openChangelog = useChangelogStore((s) => s.openChangelog)
  const markSeen = useChangelogStore((s) => s.markSeen)

  const release = getLatestRelease()

  // Auto-open the changelog the first time a player runs a freshly-shipped
  // version. Brand-new visitors (no recorded version) are marked seen silently
  // so they aren't greeted by release notes for a build they never "upgraded"
  // from. Runs once on mount.
  useEffect(() => {
    if (!release) return
    if (APP_VERSION === 'dev') return
    // Only announce notes for the build that's actually running.
    if (APP_VERSION !== release.version) return
    if (lastSeenVersion === APP_VERSION) return

    if (lastSeenVersion === null) {
      markSeen(APP_VERSION)
      return
    }

    if (compareVersions(APP_VERSION, lastSeenVersion) > 0) {
      openChangelog()
    } else {
      markSeen(APP_VERSION)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pull the localized block for this release out of the active i18n bundle.
  const content = useMemo<ReleaseContent | null>(() => {
    if (!release) return null
    const releases = t('changelog.releases', { returnObjects: true }) as
      | Record<string, ReleaseContent>
      | string
    if (!releases || typeof releases !== 'object') return null
    return releases[release.version] ?? null
    // i18n.language is a dependency so the block re-resolves on language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [release, t, i18n.language])

  if (!release) return null

  const handleClose = (next: boolean): void => {
    if (!next) markSeen(APP_VERSION === 'dev' ? release.version : APP_VERSION)
  }

  const formattedDate = (() => {
    const parsed = new Date(release.date)
    if (Number.isNaN(parsed.getTime())) return release.date
    return parsed.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  })()

  const sections = CHANGELOG_SECTIONS.map((key) => ({
    key,
    items: content?.[key] ?? [],
  })).filter((section) => section.items.length > 0)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <Sparkles className="size-4" />
            </span>
            <div className="flex flex-col text-left">
              <DialogTitle>{t('changelog.title')}</DialogTitle>
              <span className="text-xs text-muted-foreground">
                {t('changelog.versionLine', {
                  version: release.version,
                  date: formattedDate,
                })}
              </span>
            </div>
          </div>
          {content?.summary && (
            <DialogDescription className="pt-1">
              {content.summary}
            </DialogDescription>
          )}
        </DialogHeader>

        {sections.length > 0 ? (
          <div className="flex flex-col gap-4">
            {sections.map(({ key, items }) => {
              const Icon = SECTION_ICONS[key]
              return (
                <section key={key} className="flex flex-col gap-1.5">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Icon
                      className={cn('size-4', SECTION_ACCENT[key])}
                      aria-hidden="true"
                    />
                    {t(`changelog.sections.${key}`)}
                  </h3>
                  <ul className="flex flex-col gap-1 pl-1.5">
                    {items.map((item, index) => (
                      <li
                        key={index}
                        className="flex gap-2 text-sm text-muted-foreground"
                      >
                        <span
                          className={cn(
                            'mt-1.5 size-1.5 shrink-0 rounded-full bg-current',
                            SECTION_ACCENT[key],
                          )}
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('changelog.empty')}
          </p>
        )}

        <DialogFooter>
          <Button onClick={() => handleClose(false)}>
            {t('changelog.gotIt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChangelogDialog
