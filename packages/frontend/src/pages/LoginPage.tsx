import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Password } from '@/components/ui/password'
import { signIn, authClient } from '@/lib/auth-client'
import { Lock, User, Loader2, Fingerprint } from 'lucide-react'
import { AuthLayout, AuthFormError } from '@/components/security/AuthLayout'
import { safeRedirect, withRedirect } from '@/components/security/authRedirect'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { mapLoginError } from '@/lib/auth-errors'

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const supportsPasskeys = typeof window !== 'undefined' && 'PublicKeyCredential' in window

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { localizedPath } = useLocalizedPath()
  const requestedRedirect = safeRedirect(searchParams.get('redirect'))
  const redirectTo = requestedRedirect || localizedPath('/')
  const [pending, setPending] = useState<'password' | 'passkey' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isLoading = pending !== null

  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  })

  const handlePasskeyLogin = async (): Promise<void> => {
    setPending('passkey')
    setError(null)
    try {
      const result = await authClient.signIn.passkey()
      if (result?.error) {
        setError(t('security.passkeyLogin.error'))
        setPending(null)
        return
      }
      await new Promise((r) => setTimeout(r, 100))
      navigate(redirectTo)
    } catch {
      setError(t('security.passkeyLogin.error'))
      setPending(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending('password')
    setError(null)

    const identifier = formData.identifier.trim()

    try {
      let result
      if (isEmail(identifier)) {
        result = await signIn.email({
          email: identifier,
          password: formData.password,
        })
      } else {
        result = await authClient.signIn.username({
          username: identifier,
          password: formData.password,
        })
      }

      if (result.error) {
        const errorKey = mapLoginError(result.error)
        setError(t(errorKey))
        setPending(null)
        return
      }

      // Wait a moment for the session cookie to be set
      await new Promise(resolve => setTimeout(resolve, 100))
      navigate(redirectTo)
    } catch (err) {
      const errorKey = mapLoginError(err)
      setError(t(errorKey))
      setPending(null)
    }
  }

  const prefillEmail = isEmail(formData.identifier.trim()) ? formData.identifier.trim() : undefined

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link
            to={withRedirect(localizedPath('/register'), requestedRedirect)}
            className="inline-flex min-h-11 items-center px-1 font-medium text-neon-purple transition-colors hover:text-neon-pink"
          >
            {t('auth.register')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
        <div className="space-y-2">
          <Label htmlFor="login-identifier">{t('auth.emailOrUsername')}</Label>
          <div className="relative">
            <User className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="login-identifier"
              name="username"
              type="text"
              placeholder={t('auth.emailOrUsernamePlaceholder')}
              value={formData.identifier}
              onChange={(e) => setFormData({ ...formData, identifier: e.target.value })}
              autoComplete="username webauthn"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              aria-invalid={error ? true : undefined}
              className="pl-10"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="login-password">{t('auth.password')}</Label>
            <Link
              to={localizedPath('/forgot-password')}
              state={prefillEmail ? { email: prefillEmail } : undefined}
              className="-my-3 inline-flex min-h-11 items-center px-1 text-sm text-neon-purple transition-colors hover:text-neon-pink"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute inset-y-0 left-3 z-10 my-auto size-4 text-muted-foreground" aria-hidden="true" />
            <Password
              id="login-password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              autoComplete="current-password"
              enterKeyHint="go"
              aria-invalid={error ? true : undefined}
              className="pl-10"
              required
            />
          </div>
        </div>

        <AuthFormError>{error}</AuthFormError>

        <Button
          type="submit"
          variant="gaming"
          size="lg"
          className="w-full font-semibold"
          disabled={isLoading}
        >
          {pending === 'password' && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          {t('auth.login')}
        </Button>

        {supportsPasskeys && (
          <>
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('auth.or')}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handlePasskeyLogin}
              disabled={isLoading}
              className="w-full"
            >
              {pending === 'passkey' ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Fingerprint className="size-5" aria-hidden="true" />
              )}
              {t('security.passkeyLogin.button')}
            </Button>
          </>
        )}
      </form>
    </AuthLayout>
  )
}
