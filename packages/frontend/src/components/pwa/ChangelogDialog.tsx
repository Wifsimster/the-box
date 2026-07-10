import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
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
  CHANGELOG,
  CHANGELOG_SECTIONS,
  compareVersions,
  getLatestRelease,
  type ChangelogRelease,
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

const SECTION_ICONS: Record<ChangelogSection, typeof Sparkles> = {
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
 * "What's New" dialog. Auto-opens the newest release's notes once after the app
 * updates to that version, and opens on demand from the footer version chip.
 *
 * It renders the *whole* announced history as a vertical timeline (newest
 * first), so a returning player can scroll back through previous releases
 * instead of only seeing the single build they just upgraded to. All copy is
 * localized; bullet content comes from the active i18n bundle keyed by version,
 * so the notes follow the player's language.
 */
export function ChangelogDialog(): ReactElement | null {
  const { t, i18n } = useTranslation()
  const open = useChangelogStore((s) => s.open)
  const lastSeenVersion = useChangelogStore((s) => s.lastSeenVersion)
  const openChangelog = useChangelogStore((s) => s.openChangelog)
  const markSeen = useChangelogStore((s) => s.markSeen)

  const release = getLatestRelease()

  // Edge-fade affordance: the middle release band is the only scroller, so we
  // surface token-only top/bottom fades when its content overflows to signal
  // there's more to read above/below the fold.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  const updateFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    setShowTopFade(scrollTop > 4)
    setShowBottomFade(scrollTop + clientHeight < scrollHeight - 4)
  }, [])

  useEffect(() => {
    if (!open) return
    updateFades()
    window.addEventListener('resize', updateFades)
    return () => window.removeEventListener('resize', updateFades)
  }, [open, updateFades, i18n.language])

  // Auto-open the changelog the first time a player runs a build newer than the
  // one this browser last acknowledged. Brand-new visitors (no recorded version)
  // are marked seen silently so they aren't greeted by release notes for a build
  // they never "upgraded" from. Runs once on mount.
  //
  // We intentionally do NOT require the running build to exactly match the newest
  // changelog entry: if a release ships without a matching changelog bump, the
  // dialog degrades gracefully to the latest notes on record instead of being
  // silently disabled until the registry catches up.
  useEffect(() => {
    if (!release) return
    if (APP_VERSION === 'dev') return
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

  // The full localized `changelog.releases` map, resolved once for the active
  // language. Individual release blocks are looked up by version below.
  const releaseContent = useMemo<Record<string, ReleaseContent>>(() => {
    const releases = t('changelog.releases', { returnObjects: true }) as
      | Record<string, ReleaseContent>
      | string
    if (!releases || typeof releases !== 'object') return {}
    return releases
    // i18n.language is a dependency so blocks re-resolve on language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language])

  if (!release) return null

  const handleClose = (next: boolean): void => {
    if (!next) markSeen(APP_VERSION === 'dev' ? release.version : APP_VERSION)
  }

  const formatDate = (iso: string): string => {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso
    return parsed.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:gap-0 sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-14 sm:px-6 sm:pr-14">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-neon-purple to-neon-pink text-white"
              aria-hidden="true"
            >
              <Sparkles className="size-5" />
            </span>
            <div className="flex flex-col text-left">
              <DialogTitle>{t('changelog.title')}</DialogTitle>
              <DialogDescription className="text-xs">
                {t('changelog.headerSubtitle')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={updateFades}
            tabIndex={0}
            role="region"
            aria-label={t('changelog.title')}
            className="h-full overflow-y-auto px-4 py-4 sm:px-6 motion-safe:scroll-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <ol className="flex flex-col gap-6">
              {CHANGELOG.map((entry, index) => (
                <ReleaseEntry
                  key={entry.version}
                  entry={entry}
                  content={releaseContent[entry.version] ?? null}
                  isLatest={index === 0}
                  isLast={index === CHANGELOG.length - 1}
                  formattedDate={formatDate(entry.date)}
                  t={t}
                />
              ))}
            </ol>
          </div>
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-card to-transparent transition-opacity',
              showTopFade ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-linear-to-t from-card to-transparent transition-opacity',
              showBottomFade ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 sm:px-6">
          <Button className="w-full sm:w-auto" onClick={() => handleClose(false)}>
            {t('changelog.gotIt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ReleaseEntryProps {
  entry: ChangelogRelease
  content: ReleaseContent | null
  isLatest: boolean
  isLast: boolean
  formattedDate: string
  t: (key: string, options?: Record<string, unknown>) => string
}

/** One release rendered as a node on the changelog timeline. */
function ReleaseEntry({
  entry,
  content,
  isLatest,
  isLast,
  formattedDate,
  t,
}: ReleaseEntryProps): ReactElement {
  const sections = CHANGELOG_SECTIONS.map((key) => ({
    key,
    items: content?.[key] ?? [],
  })).filter((section) => section.items.length > 0)

  return (
    <li className="relative pl-7">
      {/* Rail connecting this node to the next one below it. */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute bottom-[-1.5rem] left-[6px] top-5 w-px bg-linear-to-b from-border to-transparent"
        />
      )}
      {/* Timeline node — the newest release glows in the active accent. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 rounded-full border-2 border-card',
          isLatest
            ? 'top-0.5 size-3.5 bg-primary shadow-[var(--glow-sm)]'
            : 'top-1 size-3 bg-muted-foreground/40',
        )}
      />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3
          className={cn(
            'text-sm font-semibold',
            isLatest ? 'text-primary' : 'text-foreground',
          )}
        >
          v{entry.version}
        </h3>
        {isLatest && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/30">
            {t('changelog.badge.new')}
          </span>
        )}
        <time
          dateTime={entry.date}
          className="ml-auto text-xs text-muted-foreground"
        >
          {formattedDate}
        </time>
      </div>

      {content?.summary && (
        <p className="mt-1 text-sm text-muted-foreground">{content.summary}</p>
      )}

      {sections.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {sections.map(({ key, items }) => {
            const Icon = SECTION_ICONS[key]
            return (
              <section key={key} className="flex flex-col gap-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
                  <Icon
                    className={cn('size-3.5', SECTION_ACCENT[key])}
                    aria-hidden="true"
                  />
                  <span>{t(`changelog.sections.${key}`)}</span>
                  <span
                    aria-hidden="true"
                    className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums text-foreground"
                  >
                    {items.length}
                  </span>
                  <span className="sr-only">
                    {t('changelog.itemCount', { count: items.length })}
                  </span>
                </h4>
                <ul className="flex flex-col gap-1 pl-1">
                  {items.map((item, itemIndex) => (
                    <li
                      key={itemIndex}
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
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          <Wrench className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{t('changelog.empty')}</span>
        </p>
      )}
    </li>
  )
}

export default ChangelogDialog
