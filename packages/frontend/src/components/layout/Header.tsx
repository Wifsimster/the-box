import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Home, LogOut, Settings, History } from 'lucide-react'
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

  // Show login/register buttons if there's no session
  // Also check if session is valid (has user data)
  // This handles cases where the session endpoint returns invalid data
  const hasValidSession = session && session.user && session.user.id
  const showAuthButtons = !hasValidSession

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

          {hasValidSession && (
            <Button variant="ghost" size="sm" asChild>
              <Link to={localizedPath('/history')}>
                <History className="w-4 h-4 mr-1" />
                {t('common.history')}
              </Link>
            </Button>
          )}

          {hasValidSession && session?.user?.role === 'admin' && (
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
          {showAuthButtons && (
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
          {hasValidSession && !isPending && (
            <div className="flex items-center gap-2">
              {session?.user?.role === 'admin' ? (
                <Badge variant="admin">
                  {session.user?.name || session.user?.email?.split('@')[0]}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {session.user?.name || session.user?.email?.split('@')[0]}
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
