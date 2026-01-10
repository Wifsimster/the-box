import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Trophy, Home, User } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export function Header() {
  const { t } = useTranslation()
  const { isAuthenticated, user } = useAuthStore()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neon-purple to-neon-pink flex items-center justify-center">
            <span className="text-xl font-bold text-white">B</span>
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
            The Box
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <Home className="w-4 h-4 mr-1" />
              {t('common.home')}
            </Link>
          </Button>

          <Button variant="ghost" size="sm" asChild>
            <Link to="/leaderboard">
              <Trophy className="w-4 h-4 mr-1" />
              {t('common.leaderboard')}
            </Link>
          </Button>

          <LanguageSwitcher />

          {isAuthenticated ? (
            <Button variant="outline" size="sm">
              <User className="w-4 h-4 mr-1" />
              {user?.displayName || user?.username}
            </Button>
          ) : (
            <Button variant="gaming" size="sm">
              {t('common.login')}
            </Button>
          )}
        </nav>
      </div>
    </header>
  )
}
