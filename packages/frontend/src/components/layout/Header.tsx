import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Trophy, Home, User, LogOut, Loader2 } from 'lucide-react'
import { useSession, signOut } from '@/lib/auth-client'

export function Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate('/')
        },
      },
    })
  }

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

          {isPending ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="w-4 h-4 animate-spin" />
            </Button>
          ) : session ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/profile">
                  <User className="w-4 h-4 mr-1" />
                  {session.user.name || session.user.email?.split('@')[0]}
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button variant="gaming" size="sm" asChild>
              <Link to="/login">
                {t('common.login')}
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  )
}
