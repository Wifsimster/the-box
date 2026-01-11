import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { LanguageSwitcher } from './LanguageSwitcher'
import { Trophy, Home, LogOut } from 'lucide-react'
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
    <header className="sticky top-0 z-50 w-full">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
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

          {session && !isPending && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {session.user.name || session.user.email?.split('@')[0]}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
