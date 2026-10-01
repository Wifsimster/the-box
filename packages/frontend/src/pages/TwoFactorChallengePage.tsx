import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Loader2, ArrowLeft, ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthLayout, AuthFormError } from '@/components/security/AuthLayout'
import { safeRedirect } from '@/components/security/authRedirect'
import { authClient } from '@/lib/auth-client'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

const TOTP_LENGTH = 6

// Password managers on Android (Bitwarden, …) can't fill the code field, but
// copy the TOTP to the clipboard after filling the login: one tap pastes it.
const canReadClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText

export default function TwoFactorChallengePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { localizedPath } = useLocalizedPath()
  const redirectTo = safeRedirect(searchParams.get('redirect')) || localizedPath('/')

  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'totp' | 'backup'>('totp')
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verify = async (value: string): Promise<void> => {
    if (isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      const result =
        mode === 'totp'
          ? await authClient.twoFactor.verifyTotp({ code: value.trim() })
          : await authClient.twoFactor.verifyBackupCode({ code: value.trim() })

      if (result.error) {
        setError(t('security.challenge.invalidCode'))
        setCode('')
        setIsLoading(false)
        inputRef.current?.focus()
        return
      }
      // Session cookie is set by the verify endpoint; small delay so the
      // browser commits the cookie before the next navigation.
      await new Promise((r) => setTimeout(r, 100))
      navigate(redirectTo)
    } catch {
      setError(t('security.challenge.invalidCode'))
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    void verify(code)
  }

  const handleCodeChange = (value: string): void => {
    const next = mode === 'totp' ? value.replace(/\D/g, '').slice(0, TOTP_LENGTH) : value
    setCode(next)
    if (error) setError(null)
    if (mode === 'totp' && next.length === TOTP_LENGTH && !isLoading) {
      // Authenticator apps and SMS autofill paste all six digits at once:
      // submit immediately instead of making the player hunt for the button.
      void verify(next)
    }
  }

  const pasteCode = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      const match = text.match(/\d{6}/)
      if (!match) {
        setError(t('security.challenge.pasteEmpty'))
        inputRef.current?.focus()
        return
      }
      handleCodeChange(match[0])
    } catch {
      inputRef.current?.focus()
    }
  }

  const switchMode = (): void => {
    setMode((m) => (m === 'totp' ? 'backup' : 'totp'))
    setCode('')
    setError(null)
    inputRef.current?.focus()
  }

  const isTotp = mode === 'totp'

  return (
    <AuthLayout
      icon={ShieldCheck}
      title={t('security.challenge.title')}
      subtitle={isTotp ? t('security.challenge.subtitle') : t('security.challenge.backupSubtitle')}
      footer={
        <Link
          to={localizedPath('/login')}
          className="inline-flex min-h-11 items-center gap-2 px-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('auth.backToLogin')}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="two-factor-code">
              {isTotp ? t('security.challenge.codeLabel') : t('security.challenge.backupCodeLabel')}
            </Label>
            {isTotp && canReadClipboard && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void pasteCode()}
                disabled={isLoading}
                className="-mr-2 min-h-11 gap-1.5 text-neon-purple"
              >
                <ClipboardPaste className="size-4" aria-hidden="true" />
                {t('security.challenge.paste')}
              </Button>
            )}
          </div>
          <Input
            ref={inputRef}
            id="two-factor-code"
            name={isTotp ? 'totp' : 'backup-code'}
            type="text"
            inputMode={isTotp ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            pattern={isTotp ? '\\d{6}' : undefined}
            maxLength={isTotp ? TOTP_LENGTH : 12}
            placeholder={isTotp ? '000000' : undefined}
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'two-factor-error' : undefined}
            required
            autoFocus
            className="h-14 text-center font-mono text-2xl tracking-[0.4em] md:text-2xl"
          />
        </div>

        <AuthFormError id="two-factor-error">{error}</AuthFormError>

        <Button
          type="submit"
          variant="gaming"
          size="lg"
          className="w-full font-semibold"
          disabled={isLoading || code.length === 0}
        >
          {isLoading && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
          {t('security.challenge.verify')}
        </Button>

        <Button type="button" variant="ghost" onClick={switchMode} className="w-full text-muted-foreground">
          {isTotp ? t('security.challenge.useBackupCode') : t('security.challenge.backToTotp')}
        </Button>
      </form>
    </AuthLayout>
  )
}
