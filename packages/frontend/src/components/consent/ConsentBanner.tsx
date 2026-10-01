import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cookie } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { cn } from '@/lib/utils'
import {
  useConsentStore,
  selectShouldShowConsentBanner,
} from '@/stores/consentStore'

/**
 * Fixed bottom cookie/consent banner (GDPR / RGPD). Shown until the user makes
 * an explicit choice. "Manage preferences" expands per-category toggles
 * (Essential always-on, Analytics, Support) with a Save button.
 *
 * Mounted once globally in the language layout so it appears on every page.
 */
const wrapButtonClass = 'h-auto min-h-(--control-h) whitespace-normal py-2 leading-tight'

const checkboxClass =
  'mt-0.5 size-5 shrink-0 rounded border-border bg-background/50 accent-neon-purple'

export function ConsentBanner() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const shouldShow = useConsentStore(selectShouldShowConsentBanner)
  const acceptAll = useConsentStore((s) => s.acceptAll)
  const rejectNonEssential = useConsentStore((s) => s.rejectNonEssential)
  const setPreferences = useConsentStore((s) => s.setPreferences)

  const [showPreferences, setShowPreferences] = useState(false)
  const [analytics, setAnalytics] = useState(true)
  const [support, setSupport] = useState(true)

  if (!shouldShow) return null

  const optionalCategories = [
    {
      key: 'analytics',
      checked: analytics,
      onChange: setAnalytics,
      label: t('consent.analyticsLabel'),
      desc: t('consent.analyticsDesc'),
    },
    {
      key: 'support',
      checked: support,
      onChange: setSupport,
      label: t('consent.supportLabel'),
      desc: t('consent.supportDesc'),
    },
  ]

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-desc"
      className={cn(
        // Sits *above* the mobile BottomNav rather than on top of it: anchored
        // at bottom-0 the banner covered all four tabs until the visitor made a
        // consent choice, so a first-time phone visitor had no navigation.
        // z-45: above the BottomNav (z-40) but under modal dialogs (z-50), so
        // an auto-opened dialog's bottom sheet is never hidden behind it.
        'fixed inset-x-0 bottom-[var(--bottom-nav-space)] z-[45] border-t border-border bg-card/95 backdrop-blur-md',
        'motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300',
        // `--bottom-nav-space` already carries the home-indicator inset, so only
        // pad for it from `md` up where the bar is hidden and bottom is 0.
        'md:bottom-0 md:pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <div className="mx-auto max-h-[calc(100dvh-var(--header-h)-var(--bottom-nav-space))] max-w-4xl overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 hidden size-5 shrink-0 text-neon-purple sm:block" aria-hidden="true" />
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <h2 id="consent-banner-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Cookie className="size-4 shrink-0 text-neon-purple sm:hidden" aria-hidden="true" />
                {t('consent.title')}
              </h2>
              <p id="consent-banner-desc" className="text-xs text-muted-foreground sm:text-sm">
                <span className="sm:hidden">{t('consent.descriptionShort')}</span>
                <span className="hidden sm:inline">{t('consent.description')}</span>{' '}
                <Link
                  to={localizedPath('/privacy')}
                  className="text-neon-purple underline underline-offset-2 sm:no-underline sm:hover:underline"
                >
                  {t('consent.privacyLink')}
                </Link>
              </p>
            </div>

            {showPreferences && (
              <fieldset className="space-y-1 rounded-md border border-border bg-background/40 p-2">
                <legend className="sr-only">{t('consent.managePreferences')}</legend>
                <label className="flex items-start gap-3 rounded-md p-2">
                  <input type="checkbox" checked disabled className={cn(checkboxClass, 'opacity-60')} />
                  <span className="flex-1 space-y-0.5">
                    <span className="block text-sm text-foreground">{t('consent.essentialLabel')}</span>
                    <span className="block text-xs text-muted-foreground">{t('consent.essentialDesc')}</span>
                  </span>
                </label>
                {optionalCategories.map((category) => (
                  <label
                    key={category.key}
                    className="flex cursor-pointer select-none items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={category.checked}
                      onChange={(e) => category.onChange(e.target.checked)}
                      className={cn(checkboxClass, 'cursor-pointer')}
                    />
                    <span className="flex-1 space-y-0.5">
                      <span className="block text-sm text-foreground">{category.label}</span>
                      <span className="block text-xs text-muted-foreground">{category.desc}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {showPreferences ? (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button variant="ghost" className={wrapButtonClass} onClick={() => setShowPreferences(false)}>
                  {t('common.back')}
                </Button>
                <Button
                  className={wrapButtonClass}
                  onClick={() => setPreferences({ analytics, support })}
                >
                  {t('consent.save')}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Button variant="outline" className={cn(wrapButtonClass, 'sm:order-2')} onClick={rejectNonEssential}>
                  {t('consent.rejectNonEssential')}
                </Button>
                <Button className={cn(wrapButtonClass, 'sm:order-3')} onClick={acceptAll}>
                  {t('consent.acceptAll')}
                </Button>
                <Button
                  variant="ghost"
                  className={cn(wrapButtonClass, 'col-span-2 text-muted-foreground sm:order-1 sm:mr-auto sm:px-2')}
                  onClick={() => setShowPreferences(true)}
                >
                  {t('consent.managePreferences')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
