import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useOpenChangelog } from '@/components/pwa'
import { useFeatures } from '@/hooks/useFeatures'
import { STUDIO } from '@/lib/studio'
import { format } from 'date-fns'

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const buildTime = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null

const footerLinkClass =
  'inline-flex min-h-11 items-center px-1 text-muted-foreground transition-colors hover:text-neon-purple'

export function Footer() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const openChangelog = useOpenChangelog()
  const features = useFeatures()
  const [currentYear] = useState(() => new Date().getFullYear())

  const formattedBuildTime = buildTime
    ? format(new Date(buildTime), 'dd/MM/yyyy HH:mm')
    : null

  return (
    <footer className="py-4 text-center relative z-10">
      <nav
        aria-label={t('nav.footer')}
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
        {features.geogamers && (
          <Link to={localizedPath('/panorama')} className={footerLinkClass}>
            {t('common.geogamers')}
          </Link>
        )}
        <Link to={localizedPath('/premium')} className={footerLinkClass}>
          {t('common.premium')}
        </Link>
        <Link to={localizedPath('/about')} className={footerLinkClass}>
          {t('common.about')}
        </Link>
      </nav>
      <p className="mt-2 text-xs text-muted-foreground">
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
            {formattedBuildTime && (
              <>
                <span className="max-sm:hidden">{' • '}</span>
                <span className="whitespace-nowrap max-sm:block">{formattedBuildTime}</span>
              </>
            )}
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
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
