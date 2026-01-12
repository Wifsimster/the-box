import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signIn, authClient } from '@/lib/auth-client'
import { Lock, User, Loader2, Sparkles } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { mapLoginError } from '@/lib/auth-errors'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { localizedPath } = useLocalizedPath()
  const redirectTo = searchParams.get('redirect') || localizedPath('/')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  })

  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      let result
      if (isEmail(formData.identifier)) {
        result = await signIn.email({
          email: formData.identifier,
          password: formData.password,
        })
      } else {
        result = await authClient.signIn.username({
          username: formData.identifier,
          password: formData.password,
        })
      }

      if (result.error) {
        const errorKey = mapLoginError(result.error)
        setError(t(errorKey))
        setIsLoading(false)
        return
      }

      // Wait a moment for the session cookie to be set
      await new Promise(resolve => setTimeout(resolve, 100))
      navigate(redirectTo)
    } catch (err) {
      const errorKey = mapLoginError(err)
      setError(t(errorKey))
      setIsLoading(false)
    }
  }

  const handleGuestLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await authClient.signIn.anonymous()

      if (result.error) {
        const errorKey = mapLoginError(result.error)
        setError(t(errorKey))
        setIsLoading(false)
        return
      }

      // Wait a moment for the session cookie to be set
      await new Promise(resolve => setTimeout(resolve, 100))
      navigate(redirectTo)
    } catch (err) {
      const errorKey = mapLoginError(err)
      setError(t(errorKey))
      setIsLoading(false)
    }
  }

  return (
    <>
      <CubeBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md -mt-20"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="backdrop-blur-xl bg-card/30 border border-white/10 rounded-2xl p-8 shadow-2xl"
          >
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {t('auth.loginTitle')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('auth.loginSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">
                  {t('auth.emailOrUsername')}
                </label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-purple transition-colors" />
                  <Input
                    type="text"
                    placeholder={t('auth.emailOrUsernamePlaceholder')}
                    value={formData.identifier}
                    onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
                    className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-purple/50 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground/80">
                    {t('auth.password')}
                  </label>
                  <Link
                    to={localizedPath('/forgot-password')}
                    className="text-xs text-neon-purple hover:text-neon-pink transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-purple transition-colors" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-purple/50 rounded-xl"
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                variant="gaming"
                size="lg"
                className="w-full h-12 text-base font-semibold rounded-xl"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  t('auth.login')
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card/30 backdrop-blur px-3 text-muted-foreground">
                  {t('auth.or')}
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full h-12 rounded-xl border-white/10 hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all"
              onClick={handleGuestLogin}
              disabled={isLoading}
            >
              <Sparkles className="w-4 h-4 mr-2 text-neon-cyan" />
              {t('auth.continueAsGuest')}
            </Button>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {t('auth.noAccount')}{' '}
              <Link
                to={localizedPath('/register')}
                className="text-neon-purple hover:text-neon-pink font-medium transition-colors"
              >
                {t('auth.register')}
              </Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </>
  )
}
