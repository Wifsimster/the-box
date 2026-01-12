import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Home, LogOut, Settings } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAuth } from '@/hooks/useAuth'

/**
 * Header component
 *
 * Refactored to use custom useAuth hook following SOLID principles
 * - Authentication logic extracted to useAuth hook
 * - Component focuses only on UI rendering
 */
export function Header() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Navigation */}
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={localizedPath('/')}>
              <Home className="w-4 h-4 mr-1" />
              {t('common.home')}
            </Link>
          </Button>

          <Button variant="ghost" size="sm" asChild>
            <Link to={localizedPath('/leaderboard')}>
              <Trophy className="w-4 h-4 mr-1" />
              {t('common.leaderboard')}
            </Link>
          </Button>

          {session?.user.role === 'admin' && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={localizedPath('/admin')}>
                <Settings className="w-4 h-4 mr-1" />
                {t('common.admin')}
              </Link>
            </Button>
          )}
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-3">
          {!session && !isPending && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to={localizedPath('/login')}>{t('common.login')}</Link>
              </Button>
              <Button variant="gaming" size="sm" asChild>
                <Link to={localizedPath('/register')}>
                  {t('common.register')}
                </Link>
              </Button>
            </>
          )}
          {session && !isPending && (
            <div className="flex items-center gap-2">
              {session.user.role === 'admin' ? (
                <Badge variant="admin">
                  {session.user.name || session.user.email?.split('@')[0]}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {session.user.name || session.user.email?.split('@')[0]}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
