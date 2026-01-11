import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { resetPassword } from '@/lib/auth-client'
import { Lock, Loader2, KeyRound, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [tokenError, setTokenError] = useState(false)

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  })

  const token = searchParams.get('token')

  useEffect(() => {
    // Check for error in URL params (from better-auth redirect)
    const errorParam = searchParams.get('error')
    if (errorParam === 'INVALID_TOKEN') {
      setTokenError(true)
    }

    // Check if token exists
    if (!token && !errorParam) {
      setTokenError(true)
    }
  }, [searchParams, token])

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
      await resetPassword({
        newPassword: formData.password,
        token: token!,
      }, {
        onSuccess: () => {
          setSuccess(true)
        },
        onError: (ctx) => {
          if (ctx.error.message?.includes('INVALID_TOKEN') || ctx.error.message?.includes('expired')) {
            setTokenError(true)
          } else {
            setError(ctx.error.message || t('auth.resetError'))
          }
        },
      })
    } catch {
      setError(t('auth.resetError'))
    } finally {
      setIsLoading(false)
    }
  }

  if (tokenError) {
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
              <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-red-500 to-orange-500 shadow-lg shadow-red-500/30">
                <XCircle className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                {t('auth.invalidToken')}
              </h1>
              <p className="text-muted-foreground">
                {t('auth.tokenExpiredMessage')}
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              <Link to="/forgot-password">
                <Button variant="gaming" className="w-full">
                  {t('auth.requestNewLink')}
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {t('auth.backToLogin')}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
  }

  if (success) {
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
              <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/30">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                {t('auth.passwordResetSuccess')}
              </h1>
              <p className="text-muted-foreground">
                {t('auth.passwordResetSuccessMessage')}
              </p>
            </CardHeader>

            <CardContent>
              <Button
                variant="gaming"
                className="w-full"
                onClick={() => navigate('/login')}
              >
                {t('auth.login')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    )
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
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
              {t('auth.resetPassword')}
            </h1>
            <p className="text-muted-foreground">
              {t('auth.resetPasswordSubtitle')}
            </p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('auth.newPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="pl-10"
                    minLength={6}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {t('auth.confirmNewPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
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
                  <KeyRound className="w-4 h-4 mr-2" />
                )}
                {t('auth.resetPassword')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
