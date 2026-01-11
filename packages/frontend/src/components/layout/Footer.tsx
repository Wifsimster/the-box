import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

export function Footer() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="py-4 text-center relative z-10">
      <nav className="flex items-center justify-center gap-6 text-sm flex-wrap">
        <Link
          to={localizedPath('/terms')}
          className="text-muted-foreground hover:text-neon-purple transition-colors"
        >
          {t('footer.terms')}
        </Link>
        <Link
          to={localizedPath('/privacy')}
          className="text-muted-foreground hover:text-neon-purple transition-colors"
        >
          {t('footer.privacy')}
        </Link>
        <Link
          to={localizedPath('/cookies')}
          className="text-muted-foreground hover:text-neon-purple transition-colors"
        >
          {t('footer.cookies')}
        </Link>
        <Link
          to={localizedPath('/faq')}
          className="text-muted-foreground hover:text-neon-purple transition-colors"
        >
          {t('footer.faq')}
        </Link>
        <Link
          to={localizedPath('/contact')}
          className="text-muted-foreground hover:text-neon-purple transition-colors"
        >
          {t('footer.contact')}
        </Link>
      </nav>
      <p className="mt-2 text-xs text-muted-foreground/60">
        &copy; {currentYear} The Box. {t('footer.allRightsReserved')}
      </p>
    </footer>
  )
}
