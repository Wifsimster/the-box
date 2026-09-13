import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useOpenChangelog } from '@/components/pwa'
import { STUDIO } from '@/lib/studio'
import { format } from 'date-fns'

// Get build-time constants (injected by Vite at build time)
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null

/**
 * Footer links are the app's smallest tap targets — 20px tall as bare text,
 * under the 44px Apple HIG / WCAG 2.5.5 target the mobile nav is already held
 * to. `min-h-11` (44px) pads the hit area without changing the type scale.
 */
const footerLinkClass =
  'inline-flex min-h-11 items-center px-1 text-muted-foreground transition-colors hover:text-neon-purple'

export function Footer() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const openChangelog = useOpenChangelog()
  const currentYear = new Date().getFullYear()

  // Format build time for display
  const formattedBuildTime = buildTime
    ? format(new Date(buildTime), 'dd/MM/yyyy HH:mm')
    : null

  return (
    <footer className="py-4 text-center relative z-10">
      <nav
        aria-label={t('nav.footer')}
        // `gap-y-0` because each link now carries its own 44px tap height —
        // stacking that on a 24px row gap left a cavernous wrapped footer on a
        // phone, where these six links always wrap to two or three rows.
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-0 text-sm"
      >
        <Link
          to={localizedPath('/terms')}
          className={footerLinkClass}
        >
          {t('footer.terms')}
        </Link>
        <Link
          to={localizedPath('/privacy')}
          className={footerLinkClass}
        >
          {t('footer.privacy')}
        </Link>
        <Link
          to={localizedPath('/cookies')}
          className={footerLinkClass}
        >
          {t('footer.cookies')}
        </Link>
        <Link
          to={localizedPath('/faq')}
          className={footerLinkClass}
        >
          {t('footer.faq')}
        </Link>
        <Link
          to={localizedPath('/rules')}
          className={footerLinkClass}
        >
          {t('footer.rules')}
        </Link>
        <Link
          to={localizedPath('/contact')}
          className={footerLinkClass}
        >
          {t('footer.contact')}
        </Link>
      </nav>
      <p className="mt-2 text-xs text-muted-foreground/60">
        &copy; {currentYear} The Box. {t('footer.allRightsReserved')}
        {appVersion !== 'dev' && (
          <>
            {' • '}
            <button
              type="button"
              onClick={openChangelog}
              className="inline-flex min-h-11 items-center px-2 align-middle underline-offset-2 transition-colors hover:text-neon-purple hover:underline"
              title={t('changelog.openTitle')}
            >
              v{appVersion}
            </button>
            {formattedBuildTime && ` • ${formattedBuildTime}`}
          </>
        )}
      </p>
      {/* Studio credit — inline in prose, so the WCAG 2.5.8 inline exception
          applies and the link doesn't need the 44px box the nav links carry. */}
      <p className="mt-1 text-xs text-muted-foreground/60">
        {t('footer.studioBy')}{' '}
        <a
          href={STUDIO.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 transition-colors hover:text-neon-purple hover:underline"
        >
          {STUDIO.name}
        </a>
      </p>
    </footer>
  )
}
