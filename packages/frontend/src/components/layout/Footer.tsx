import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

export function Footer() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-card/30">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            &copy; {currentYear} The Box. {t('footer.allRightsReserved')}
          </div>

          <nav className="flex items-center gap-6 text-sm">
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
              to={localizedPath('/contact')}
              className="text-muted-foreground hover:text-neon-purple transition-colors"
            >
              {t('footer.contact')}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
