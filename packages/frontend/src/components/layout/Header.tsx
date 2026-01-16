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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Trophy, Home, LogOut, Settings, History, Menu, User, ChevronDown } from 'lucide-react'
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

        <Button variant="ghost" size="sm" asChild className={mobileClasses}>
          <Link to={localizedPath('/tournaments')} onClick={handleClick}>
            <Trophy className={`w-4 h-4 ${iconClass}`} />
            Tournaments
          </Link>
        </Button>
      </>
    )
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/20 bg-transparent backdrop-blur-md supports-[backdrop-filter]:backdrop-blur-md">
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
                    <>
                      <Button variant="ghost" size="sm" asChild className="w-full justify-start">
                        <Link to={localizedPath('/login')} onClick={() => setMobileMenuOpen(false)}>
                          {t('common.login')}
                        </Link>
                      </Button>
                      <Button variant="gaming" size="sm" asChild className="w-full mt-2">
                        <Link to={localizedPath('/register')} onClick={() => setMobileMenuOpen(false)}>
                          {t('common.register')}
                        </Link>
                      </Button>
                    </>
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

        {/* Mobile Username Display - shown on mobile, hidden on md and up */}
        <div className="flex md:hidden items-center">
          {hasValidSession && !isPending && session.user?.name !== 'Anonymous' && (
            <Link to={localizedPath('/profile')} className="flex items-center hover:opacity-80 transition-opacity">
              {session?.user?.role === 'admin' ? (
                <Badge variant="admin" className="text-xs cursor-pointer">
                  {session.user?.name || session.user?.email?.split('@')[0]}
                </Badge>
              ) : (
                <span className="text-xs sm:text-sm font-semibold text-foreground truncate max-w-37.5 sm:max-w-50 underline decoration-2 decoration-primary underline-offset-4">
                  {session.user?.name || session.user?.email?.split('@')[0]}
                </span>
              )}
            </Link>
          )}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 hover:bg-primary/10 transition-all border-0"
                >
                  <User className="w-4 h-4 text-white" />
                  {session?.user?.role === 'admin' ? (
                    <Badge variant="admin" className="cursor-pointer text-xs">
                      {session.user?.name || session.user?.email?.split('@')[0]}
                    </Badge>
                  ) : (
                    <span className="text-sm font-bold text-white">
                      {session.user?.name || session.user?.email?.split('@')[0]}
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 text-white" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to={localizedPath('/profile')} className="flex items-center gap-2 cursor-pointer">
                    <User className="w-4 h-4" />
                    {t('common.profile')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={localizedPath('/history')} className="flex items-center gap-2 cursor-pointer">
                    <History className="w-4 h-4" />
                    {t('common.history')}
                  </Link>
                </DropdownMenuItem>
                {session?.user?.role === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link to={localizedPath('/admin')} className="flex items-center gap-2 cursor-pointer">
                      <Settings className="w-4 h-4" />
                      {t('common.admin')}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                  <LogOut className="w-4 h-4" />
                  {t('common.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
