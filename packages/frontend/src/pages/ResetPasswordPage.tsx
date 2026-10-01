import { useReducer, useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Password } from '@/components/ui/password'
import { resetPassword } from '@/lib/auth-client'
import { Lock, Loader2, KeyRound, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { AuthLayout, AuthFormError } from '@/components/security/AuthLayout'

interface ResetState {
  isLoading: boolean
  error: string | null
  success: boolean
  tokenError: boolean
}

type ResetAction =
  | { type: 'submitStart' }
  | { type: 'fail'; error: string }
  | { type: 'tokenInvalid' }
  | { type: 'succeed' }
  | { type: 'finishLoading' }

const initialResetState: ResetState = {
  isLoading: false,
  error: null,
  success: false,
  tokenError: false,
}

function resetReducer(state: ResetState, action: ResetAction): ResetState {
  switch (action.type) {
    case 'submitStart':
      return { ...state, isLoading: true, error: null }
    case 'fail':
      return { ...state, error: action.error, isLoading: false }
    case 'tokenInvalid':
      return { ...state, tokenError: true, isLoading: false }
    case 'succeed':
      return { ...state, success: true }
    case 'finishLoading':
      return { ...state, isLoading: false }
    default:
      return state
  }
}

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const [searchParams] = useSearchParams()
  const [state, dispatch] = useReducer(resetReducer, initialResetState)
  const { isLoading, error, success, tokenError } = state

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  })

  const token = searchParams.get('token')

  useEffect(() => {
    // Check for error in URL params (from better-auth redirect)
    const errorParam = searchParams.get('error')
    if (errorParam === 'INVALID_TOKEN') {
      dispatch({ type: 'tokenInvalid' })
    }

    // Check if token exists
    if (!token && !errorParam) {
      dispatch({ type: 'tokenInvalid' })
    }
  }, [searchParams, token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    dispatch({ type: 'submitStart' })

    if (formData.password.length < 8) {
      dispatch({ type: 'fail', error: t('auth.passwordTooShort') })
      return
    }

    if (formData.password.length > 128) {
      dispatch({ type: 'fail', error: t('auth.passwordTooLong') })
      return
    }

    if (formData.password !== formData.confirmPassword) {
      dispatch({ type: 'fail', error: t('auth.passwordMismatch') })
      return
    }

    try {
      await resetPassword({
        newPassword: formData.password,
        token: token!,
      }, {
        onSuccess: () => {
          dispatch({ type: 'succeed' })
        },
        onError: (ctx) => {
          if (ctx.error.message?.includes('INVALID_TOKEN') || ctx.error.message?.includes('expired')) {
            dispatch({ type: 'tokenInvalid' })
          } else {
            dispatch({ type: 'fail', error: t('auth.resetError') })
          }
        },
      })
    } catch {
      dispatch({ type: 'fail', error: t('auth.resetError') })
    } finally {
      dispatch({ type: 'finishLoading' })
    }
  }

  if (tokenError) {
    return (
      <AuthLayout
        icon={XCircle}
        iconClassName="bg-error/15 text-error"
        title={t('auth.invalidToken')}
        subtitle={t('auth.tokenExpiredMessage')}
      >
        <div className="space-y-3">
          <Button variant="gaming" size="lg" className="w-full" asChild>
            <Link to={localizedPath('/forgot-password')}>
              {t('auth.requestNewLink')}
            </Link>
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link to={localizedPath('/login')}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('auth.backToLogin')}
            </Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (success) {
    return (
      <AuthLayout
        icon={CheckCircle}
        iconClassName="bg-success/15 text-success"
        title={t('auth.passwordResetSuccess')}
        subtitle={<span role="status">{t('auth.passwordResetSuccessMessage')}</span>}
      >
        <Button variant="gaming" size="lg" className="w-full" asChild>
          <Link to={localizedPath('/login')}>{t('auth.login')}</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      icon={KeyRound}
      title={t('auth.resetPassword')}
      subtitle={t('auth.resetPasswordSubtitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
        <div className="space-y-2">
          <Label htmlFor="reset-password">{t('auth.newPassword')}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute inset-y-0 left-3 z-10 my-auto size-4 text-muted-foreground" aria-hidden="true" />
            <Password
              id="reset-password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="pl-10"
              autoComplete="new-password"
              enterKeyHint="next"
              aria-describedby="reset-password-hint"
              minLength={8}
              maxLength={128}
              required
            />
          </div>
          <p id="reset-password-hint" className="text-sm text-muted-foreground">
            {t('auth.passwordHint')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reset-password-confirm">{t('auth.confirmNewPassword')}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute inset-y-0 left-3 z-10 my-auto size-4 text-muted-foreground" aria-hidden="true" />
            <Password
              id="reset-password-confirm"
              name="confirmPassword"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="pl-10"
              autoComplete="new-password"
              enterKeyHint="done"
              aria-invalid={error ? true : undefined}
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
          {isLoading && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          {t('auth.resetPassword')}
        </Button>
      </form>
    </AuthLayout>
  )
}
