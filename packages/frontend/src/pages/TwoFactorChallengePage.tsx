import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { authClient } from '@/lib/auth-client'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

export default function TwoFactorChallengePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { localizedPath } = useLocalizedPath()
  const redirectTo = searchParams.get('redirect') || localizedPath('/')

  const [mode, setMode] = useState<'totp' | 'backup'>('totp')
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const result =
        mode === 'totp'
          ? await authClient.twoFactor.verifyTotp({ code: code.trim() })
          : await authClient.twoFactor.verifyBackupCode({ code: code.trim() })

      if (result.error) {
        setError(t('security.challenge.invalidCode'))
        setIsLoading(false)
        return
      }
      // Session cookie is set by the verify endpoint; small delay so the
      // browser commits the cookie before the next navigation.
      await new Promise((r) => setTimeout(r, 100))
      navigate(redirectTo)
    } catch {
      setError(t('security.challenge.invalidCode'))
      setIsLoading(false)
    }
  }

  const switchMode = (): void => {
    setMode((m) => (m === 'totp' ? 'backup' : 'totp'))
    setCode('')
    setError(null)
  }

  return (
    <>
      <CubeBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md -mt-20"
        >
          <div className="backdrop-blur-xl bg-card/30 border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neon-purple/15 mb-3">
                <ShieldCheck className="w-6 h-6 text-neon-purple" />
              </div>
              <h1 className="text-2xl font-bold mb-2">
                {t('security.challenge.title')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === 'totp'
                  ? t('security.challenge.subtitle')
                  : t('security.challenge.backupCodeLabel')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground/80">
                  {mode === 'totp'
                    ? t('security.challenge.codeLabel')
                    : t('security.challenge.backupCodeLabel')}
                </label>
                <Input
                  type="text"
                  inputMode={mode === 'totp' ? 'numeric' : 'text'}
                  autoComplete="one-time-code"
                  pattern={mode === 'totp' ? '\\d{6}' : undefined}
                  maxLength={mode === 'totp' ? 6 : 12}
                  value={code}
                  onChange={(e) =>
                    setCode(
                      mode === 'totp' ? e.target.value.replace(/\D/g, '') : e.target.value,
                    )
                  }
                  required
                  autoFocus
                  className="mt-2 h-12 text-center text-lg font-mono tracking-widest"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center"
                >
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                variant="gaming"
                size="lg"
                className="w-full h-12 text-base font-semibold rounded-xl"
                disabled={isLoading || code.length === 0}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  t('security.challenge.verify')
                )}
              </Button>

              <button
                type="button"
                onClick={switchMode}
                className="block w-full text-center text-xs text-muted-foreground hover:text-neon-purple transition-colors"
              >
                {mode === 'totp'
                  ? t('security.challenge.useBackupCode')
                  : t('security.challenge.backToTotp')}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </>
  )
}
