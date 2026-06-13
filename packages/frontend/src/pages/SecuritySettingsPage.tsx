import { useEffect, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Shield, KeyRound, Loader2, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { authClient } from '@/lib/auth-client'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { toast } from '@/lib/toast'

import { TotpEnrollmentDialog, type TotpEnrollment } from '@/components/security/TotpEnrollmentDialog'
import { PasskeyManager } from '@/components/security/PasskeyManager'

type TotpStep = 'idle' | 'password' | 'verify' | 'backup'

interface TotpState {
  step: TotpStep
  password: string
  code: string
  data: TotpEnrollment | null
  busy: boolean
}

type TotpAction =
  | { type: 'start' }
  | { type: 'setPassword'; password: string }
  | { type: 'setCode'; code: string }
  | { type: 'busy'; busy: boolean }
  | { type: 'enrolled'; data: TotpEnrollment }
  | { type: 'verified' }
  | { type: 'reset' }

const initialTotpState: TotpState = {
  step: 'idle',
  password: '',
  code: '',
  data: null,
  busy: false,
}

function totpReducer(state: TotpState, action: TotpAction): TotpState {
  switch (action.type) {
    case 'start':
      return { ...initialTotpState, step: 'password' }
    case 'setPassword':
      return { ...state, password: action.password }
    case 'setCode':
      return { ...state, code: action.code }
    case 'busy':
      return { ...state, busy: action.busy }
    case 'enrolled':
      return { ...state, data: action.data, step: 'verify', busy: false }
    case 'verified':
      return { ...state, step: 'backup', busy: false }
    case 'reset':
      return initialTotpState
    default:
      return state
  }
}

export default function SecuritySettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { localizedPath } = useLocalizedPath()
  const { session, isPending } = useAuth()

  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  )

  // ---------- TOTP enable / disable flow ----------
  const [totp, dispatchTotp] = useReducer(totpReducer, initialTotpState)
  const { step: totpStep, password: totpPassword, code: totpCode, data: totpData, busy: totpBusy } = totp

  useEffect(() => {
    if (!isPending && !session) {
      navigate(localizedPath('/login'))
    }
  }, [isPending, session, navigate, localizedPath])

  const isAnonymous = Boolean(
    (session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous,
  )

  const startEnableTotp = (): void => {
    dispatchTotp({ type: 'start' })
  }

  const submitTotpPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    dispatchTotp({ type: 'busy', busy: true })
    try {
      const result = await authClient.twoFactor.enable({ password: totpPassword })
      if (result.error || !result.data) {
        toast.error(result.error?.message ?? t('security.totp.disabledError'))
        dispatchTotp({ type: 'busy', busy: false })
        return
      }
      const data = result.data as TotpEnrollment
      dispatchTotp({ type: 'enrolled', data })
    } finally {
      dispatchTotp({ type: 'busy', busy: false })
    }
  }

  const submitTotpVerify = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    dispatchTotp({ type: 'busy', busy: true })
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totpCode.trim() })
      if (result.error) {
        toast.error(t('security.totp.verifyError'))
        dispatchTotp({ type: 'busy', busy: false })
        return
      }
      toast.success(t('security.totp.verifySuccess'))
      dispatchTotp({ type: 'verified' })
    } finally {
      dispatchTotp({ type: 'busy', busy: false })
    }
  }

  const closeTotpDialog = (): void => {
    dispatchTotp({ type: 'reset' })
  }

  const disableTotp = async (): Promise<void> => {
    const password = window.prompt(t('security.totp.passwordPrompt'))
    if (!password) return
    dispatchTotp({ type: 'busy', busy: true })
    try {
      const result = await authClient.twoFactor.disable({ password })
      if (result.error) {
        toast.error(t('security.totp.disabledError'))
        return
      }
      toast.success(t('security.totp.disabledSuccess'))
    } finally {
      dispatchTotp({ type: 'busy', busy: false })
    }
  }

  if (isPending) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-10">
        <Skeleton className="h-10 w-1/2 mb-4" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <button
        type="button"
        onClick={() => navigate(localizedPath('/profile'))}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-neon-purple transition-colors"
      >
        <ChevronLeft className="size-4" /> {t('security.backToProfile')}
      </button>

      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Shield className="size-7 text-neon-purple" /> {t('security.title')}
        </h1>
        <p className="text-muted-foreground mb-6">{t('security.subtitle')}</p>

        {/* --------- TOTP --------- */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <KeyRound className="size-5" />
                {t('security.totp.title')}
              </span>
              {twoFactorEnabled ? (
                <Badge className="bg-success/15 text-success border-success/30">
                  {t('security.totp.enabled')}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  {t('security.totp.disabled')}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>{t('security.totp.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            {twoFactorEnabled ? (
              <Button
                variant="outline"
                onClick={disableTotp}
                disabled={totpBusy || isAnonymous}
              >
                {totpBusy ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : null}
                {t('security.totp.disable')}
              </Button>
            ) : (
              <Button
                variant="gaming"
                onClick={startEnableTotp}
                disabled={totpBusy || isAnonymous}
              >
                {t('security.totp.enable')}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* --------- Passkeys --------- */}
        <PasskeyManager isAnonymous={isAnonymous} />
      </m.div>

      {/* ---------- TOTP enrollment dialog ---------- */}
      <TotpEnrollmentDialog
        step={totpStep}
        password={totpPassword}
        code={totpCode}
        data={totpData}
        busy={totpBusy}
        onPasswordChange={(value) => dispatchTotp({ type: 'setPassword', password: value })}
        onCodeChange={(value) => dispatchTotp({ type: 'setCode', code: value })}
        onSubmitPassword={submitTotpPassword}
        onSubmitVerify={submitTotpVerify}
        onClose={closeTotpDialog}
      />
    </div>
  )
}
