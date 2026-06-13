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

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('consent.title')}
      className={cn(
        'fixed inset-x-0 bottom-0 z-[90] border-t border-border bg-card/95 backdrop-blur-md',
        'motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 size-5 shrink-0 text-neon-purple" aria-hidden="true" />
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                {t('consent.title')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('consent.description')}{' '}
                <Link
                  to={localizedPath('/privacy')}
                  className="text-neon-purple underline-offset-2 hover:underline"
                >
                  {t('consent.privacyLink')}
                </Link>
              </p>
            </div>

            {showPreferences && (
              <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
                <label className="flex items-start gap-3 opacity-70">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-background/50 accent-neon-purple"
                  />
                  <span className="flex-1 space-y-0.5">
                    <span className="block text-sm text-foreground/90">
                      {t('consent.essentialLabel')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('consent.essentialDesc')}
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(e) => setAnalytics(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-background/50 accent-neon-purple cursor-pointer"
                  />
                  <span className="flex-1 space-y-0.5">
                    <span className="block text-sm text-foreground/90">
                      {t('consent.analyticsLabel')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('consent.analyticsDesc')}
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={support}
                    onChange={(e) => setSupport(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-background/50 accent-neon-purple cursor-pointer"
                  />
                  <span className="flex-1 space-y-0.5">
                    <span className="block text-sm text-foreground/90">
                      {t('consent.supportLabel')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('consent.supportDesc')}
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {showPreferences ? (
                <Button
                  size="sm"
                  onClick={() => setPreferences({ analytics, support })}
                >
                  {t('consent.save')}
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={acceptAll}>
                    {t('consent.acceptAll')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={rejectNonEssential}>
                    {t('consent.rejectNonEssential')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowPreferences(true)}
                  >
                    {t('consent.managePreferences')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
