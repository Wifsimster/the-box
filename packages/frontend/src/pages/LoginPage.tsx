import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { signIn, authClient } from '@/lib/auth-client'
import { LogIn, Mail, Lock, User, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/'
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginMethod, setLoginMethod] = useState<'email' | 'username'>('email')

  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (loginMethod === 'email') {
        await signIn.email({
          email: formData.email,
          password: formData.password,
        }, {
          onSuccess: () => {
            navigate(redirectTo)
          },
          onError: (ctx) => {
            setError(ctx.error.message || t('auth.invalidCredentials'))
          },
        })
      } else {
        await authClient.signIn.username({
          username: formData.username,
          password: formData.password,
        }, {
          onSuccess: () => {
            navigate(redirectTo)
          },
          onError: (ctx) => {
            setError(ctx.error.message || t('auth.invalidCredentials'))
          },
        })
      }
    } catch {
      setError(t('auth.loginError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGuestLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      await authClient.signIn.anonymous({}, {
        onSuccess: () => {
          navigate(redirectTo)
        },
        onError: (ctx) => {
          setError(ctx.error.message || t('auth.guestError'))
        },
      })
    } catch {
      setError(t('auth.guestError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 flex items-center justify-center min-h-[calc(100vh-80px)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="bg-card/50 border-border">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
              {t('auth.login')}
            </h1>
            <p className="text-muted-foreground">
              {t('auth.loginSubtitle')}
            </p>
          </CardHeader>

          <CardContent>
            {/* Login method toggle */}
            <div className="flex gap-2 mb-6">
              <Button
                type="button"
                variant={loginMethod === 'email' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setLoginMethod('email')}
              >
                <Mail className="w-4 h-4 mr-2" />
                Email
              </Button>
              <Button
                type="button"
                variant={loginMethod === 'username' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setLoginMethod('username')}
              >
                <User className="w-4 h-4 mr-2" />
                {t('auth.username')}
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {loginMethod === 'email' ? (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {t('auth.email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    {t('auth.username')}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t('auth.usernamePlaceholder')}
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="gaming"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <LogIn className="w-4 h-4 mr-2" />
                )}
                {t('auth.login')}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  {t('auth.or')}
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full mb-4"
              onClick={handleGuestLogin}
              disabled={isLoading}
            >
              {t('auth.continueAsGuest')}
            </Button>

            <div className="text-center space-y-2">
              <Link
                to="/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('auth.forgotPassword')}
              </Link>
              <p className="text-sm text-muted-foreground">
                {t('auth.noAccount')}{' '}
                <Link
                  to="/register"
                  className="text-neon-purple hover:text-neon-pink transition-colors"
                >
                  {t('auth.register')}
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
