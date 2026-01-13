import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Trophy, Home, LogOut, Settings, History, Menu } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { useAuth } from '@/hooks/useAuth'

/**
 * Header component
 *
 * Refactored to use custom useAuth hook following SOLID principles
 * - Authentication logic extracted to useAuth hook
 * - Component focuses only on UI rendering
 * - Mobile responsive with hamburger menu
 */
export function Header() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Show login/register buttons if there's no session
  // Also check if session is valid (has user data)
  // This handles cases where the session endpoint returns invalid data
  const hasValidSession = session && session.user && session.user.id
  const showAuthButtons = !hasValidSession

  const NavigationLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
    const mobileClasses = isMobile ? "w-full justify-start" : ""
    const iconClass = isMobile ? "mr-2" : "mr-1"
    const handleClick = isMobile ? () => setMobileMenuOpen(false) : undefined

    return (
      <>
        <Button variant="ghost" size="sm" asChild className={mobileClasses}>
          <Link to={localizedPath('/')} onClick={handleClick}>
            <Home className={`w-4 h-4 ${iconClass}`} />
            {t('common.home')}
          </Link>
        </Button>

        <Button variant="ghost" size="sm" asChild className={mobileClasses}>
          <Link to={localizedPath('/leaderboard')} onClick={handleClick}>
            <Trophy className={`w-4 h-4 ${iconClass}`} />
            {t('common.leaderboard')}
          </Link>
        </Button>

        {hasValidSession && (
          <Button variant="ghost" size="sm" asChild className={mobileClasses}>
            <Link to={localizedPath('/history')} onClick={handleClick}>
              <History className={`w-4 h-4 ${iconClass}`} />
              {t('common.history')}
            </Link>
          </Button>
        )}

        {hasValidSession && session?.user?.role === 'admin' && (
          <Button variant="ghost" size="sm" asChild className={mobileClasses}>
            <Link to={localizedPath('/admin')} onClick={handleClick}>
              <Settings className={`w-4 h-4 ${iconClass}`} />
              {t('common.admin')}
            </Link>
          </Button>
        )}
      </>
    )
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4">
        {/* Mobile Menu Button - shown on mobile, hidden on md and up */}
        <div className="flex md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Toggle menu">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[320px]">
              <SheetHeader>
                <SheetTitle className="text-left">Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-2 mt-6">
                <NavigationLinks isMobile={true} />
                
                {/* Mobile Auth Section */}
                <div className="border-t border-border pt-4 mt-4">
                  {showAuthButtons ? (
                    <div className="flex flex-col gap-2">
                      <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                        <Link to={localizedPath('/login')} onClick={() => setMobileMenuOpen(false)}>
                          {t('common.login')}
                        </Link>
                      </Button>
                      <Button variant="gaming" size="sm" asChild className="w-full">
                        <Link to={localizedPath('/register')} onClick={() => setMobileMenuOpen(false)}>
                          {t('common.register')}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    hasValidSession && !isPending && (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          {session?.user?.role === 'admin' ? (
                            <Badge variant="admin">
                              {session.user?.name || session.user?.email?.split('@')[0]}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {session.user?.name || session.user?.email?.split('@')[0]}
                            </span>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => {
                          signOut()
                          setMobileMenuOpen(false)
                        }} className="w-full justify-start">
                          <LogOut className="w-4 h-4 mr-2" />
                          {t('common.logout')}
                        </Button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Navigation - hidden on mobile, shown on md and up */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          <NavigationLinks isMobile={false} />
        </nav>

        {/* Auth Buttons - Desktop - hidden on mobile, shown on md and up */}
        <div className="hidden md:flex items-center gap-2 lg:gap-3">
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
