import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Sparkles, Wrench, Zap } from 'lucide-react'
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
 * Releases are laid out on a *horizontal timeline* (newest first, left to
 * right): each version is a tappable stop, and the body shows one release at a
 * time. Players page between versions with the timeline itself, the footer
 * chevrons, or the keyboard (arrow keys on the timeline). All copy is
 * localized; bullet content comes from the active i18n bundle keyed by
 * version, so the notes follow the player's language.
 */
export function ChangelogDialog(): ReactElement | null {
  const { t, i18n } = useTranslation()
  const open = useChangelogStore((s) => s.open)
  const lastSeenVersion = useChangelogStore((s) => s.lastSeenVersion)
  const openChangelog = useChangelogStore((s) => s.openChangelog)
  const markSeen = useChangelogStore((s) => s.markSeen)
  const reducedMotion = useReducedMotion()

  const release = getLatestRelease()

  // Which release is on screen (0 = newest) and which way the last page turn
  // went (1 = towards older, -1 = towards newer) so the panel slides that way.
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(0)

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(CHANGELOG.length - 1, index))
      if (clamped === activeIndex) return
      setDirection(clamped > activeIndex ? 1 : -1)
      setActiveIndex(clamped)
    },
    [activeIndex],
  )

  // Always land on the newest release when the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setActiveIndex(0)
      setDirection(0)
    }
  }, [open])

  // Edge-fade affordance: the release panel is the only vertical scroller, so
  // we surface token-only top/bottom fades when its content overflows to signal
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
    const el = scrollRef.current
    if (el) el.scrollTop = 0
    updateFades()
    window.addEventListener('resize', updateFades)
    return () => window.removeEventListener('resize', updateFades)
  }, [open, activeIndex, updateFades, i18n.language])

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

  const activeEntry = CHANGELOG[activeIndex] ?? release

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

  const formatShortDate = (iso: string): string => {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso
    return parsed.toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
    })
  }

  // Slide the panel towards older releases (right) or newer ones (left);
  // reduced-motion players get a plain cross-fade.
  const slide = reducedMotion ? 0 : 24
  const panelVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * slide }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -slide }),
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

        <VersionTimeline
          activeIndex={activeIndex}
          onSelect={goTo}
          formatShortDate={formatShortDate}
          t={t}
        />

        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={updateFades}
            tabIndex={0}
            role="tabpanel"
            id="changelog-release-panel"
            aria-labelledby={`changelog-tab-${activeEntry.version}`}
            className="h-full overflow-y-auto px-4 py-4 sm:px-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <m.div
                key={activeEntry.version}
                custom={direction}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reducedMotion ? 0 : 0.18 }}
              >
                <ReleaseEntry
                  entry={activeEntry}
                  content={releaseContent[activeEntry.version] ?? null}
                  isLatest={activeIndex === 0}
                  formattedDate={formatDate(activeEntry.date)}
                  t={t}
                />
              </m.div>
            </AnimatePresence>
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

        <DialogFooter className="shrink-0 flex-row items-center gap-3 border-t border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-full"
              onClick={() => goTo(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label={t('changelog.pagination.previous')}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <span
              className="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              <span aria-hidden="true">
                {activeIndex + 1} / {CHANGELOG.length}
              </span>
              <span className="sr-only">
                {t('changelog.pagination.status', {
                  current: activeIndex + 1,
                  total: CHANGELOG.length,
                })}
              </span>
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-full"
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex === CHANGELOG.length - 1}
              aria-label={t('changelog.pagination.next')}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <Button className="ml-auto" onClick={() => handleClose(false)}>
            {t('changelog.gotIt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface VersionTimelineProps {
  activeIndex: number
  onSelect: (index: number) => void
  formatShortDate: (iso: string) => string
  t: (key: string, options?: Record<string, unknown>) => string
}

/**
 * Horizontal timeline strip — one stop per announced release, newest on the
 * left. Implements the ARIA tabs pattern: the strip is a `tablist`, stops are
 * `tab`s with a roving tabindex, and Left/Right/Home/End move + activate.
 */
function VersionTimeline({
  activeIndex,
  onSelect,
  formatShortDate,
  t,
}: VersionTimelineProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the active stop visible as the player pages through releases.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const node = list.querySelector<HTMLElement>('[aria-selected="true"]')
    node?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [activeIndex])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    let next: number | null = null
    if (event.key === 'ArrowRight') next = activeIndex + 1
    else if (event.key === 'ArrowLeft') next = activeIndex - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = CHANGELOG.length - 1
    if (next === null) return
    event.preventDefault()
    const clamped = Math.max(0, Math.min(CHANGELOG.length - 1, next))
    onSelect(clamped)
    const tabs = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs?.[clamped]?.focus()
  }

  return (
    <div className="relative shrink-0 border-b border-border bg-muted/30">
      <div
        ref={listRef}
        role="tablist"
        aria-label={t('changelog.timeline.label')}
        onKeyDown={handleKeyDown}
        className="flex overflow-x-auto px-2 py-2.5 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CHANGELOG.map((entry, index) => {
          const isActive = index === activeIndex
          const isLatest = index === 0
          return (
            <button
              key={entry.version}
              type="button"
              role="tab"
              id={`changelog-tab-${entry.version}`}
              aria-controls="changelog-release-panel"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(index)}
              className="group flex min-w-[5.5rem] shrink-0 flex-col items-center gap-1 rounded-lg px-2 pb-1.5 pt-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Stop marker sitting on the connecting rail. */}
              <span className="relative flex h-4 w-full items-center justify-center">
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[-0.5rem] right-1/2 top-1/2 h-px -translate-y-1/2 bg-border"
                  />
                )}
                {index < CHANGELOG.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 right-[-0.5rem] top-1/2 h-px -translate-y-1/2 bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative z-10 rounded-full border-2 border-card transition-all',
                    isActive
                      ? 'size-3.5 bg-primary shadow-[var(--glow-sm)]'
                      : cn(
                          'size-2.5 bg-muted-foreground/40 group-hover:bg-muted-foreground/70',
                          isLatest && 'bg-primary/60',
                        ),
                  )}
                />
              </span>
              <span
                className={cn(
                  'text-xs font-semibold leading-none transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              >
                v{entry.version}
              </span>
              <span className="text-[10px] leading-none text-muted-foreground">
                {formatShortDate(entry.date)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface ReleaseEntryProps {
  entry: ChangelogRelease
  content: ReleaseContent | null
  isLatest: boolean
  formattedDate: string
  t: (key: string, options?: Record<string, unknown>) => string
}

/** One release's notes — the tab panel body for the selected timeline stop. */
function ReleaseEntry({
  entry,
  content,
  isLatest,
  formattedDate,
  t,
}: ReleaseEntryProps): ReactElement {
  const sections = CHANGELOG_SECTIONS.map((key) => ({
    key,
    items: content?.[key] ?? [],
  })).filter((section) => section.items.length > 0)

  return (
    <article>
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
    </article>
  )
}

export default ChangelogDialog
