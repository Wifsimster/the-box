import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'
import { Mail, Lock, User, Loader2, UserPlus } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordMismatch'))
      setIsLoading(false)
      return
    }

    if (formData.password.length < 6) {
      setError(t('auth.passwordTooShort'))
      setIsLoading(false)
      return
    }

    try {
      await authClient.signUp.email({
        email: formData.email,
        password: formData.password,
        name: formData.username,
        username: formData.username,
      }, {
        onSuccess: () => {
          navigate(localizedPath('/'))
        },
        onError: (ctx) => {
          setError(ctx.error.message || t('auth.registerError'))
        },
      })
    } catch {
      setError(t('auth.registerError'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <CubeBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Logo & Title */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-center mb-8"
          >
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.2, type: 'spring' }}
              className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-2xl bg-linear-to-br from-neon-cyan to-neon-purple shadow-2xl shadow-neon-cyan/40"
            >
              <UserPlus className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold bg-linear-to-r from-neon-cyan via-neon-purple to-neon-pink bg-clip-text text-transparent">
              {t('auth.register')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('auth.registerSubtitle')}
            </p>
          </motion.div>

          {/* Register Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="backdrop-blur-xl bg-card/30 border border-white/10 rounded-2xl p-8 shadow-2xl"
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">
                  {t('auth.username')}
                </label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                  <Input
                    type="text"
                    placeholder={t('auth.usernamePlaceholder')}
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
                    minLength={3}
                    maxLength={50}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">
                  {t('auth.email')}
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">
                  {t('auth.password')}
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/80">
                  {t('auth.confirmPassword')}
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-neon-cyan transition-colors" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="pl-11 h-12 bg-background/50 border-white/10 focus:border-neon-cyan/50 rounded-xl"
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
                  t('auth.register')
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {t('auth.hasAccount')}{' '}
              <Link
                to={localizedPath('/login')}
                className="text-neon-purple hover:text-neon-pink font-medium transition-colors"
              >
                {t('auth.login')}
              </Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </>
  )
}
