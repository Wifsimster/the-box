import { useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { authClient } from '@/lib/auth-client'
import { useAuth } from '@/hooks/useAuth'
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

/**
 * SecurityPanel — two-factor (TOTP) + passkey management, rendered inside the
 * profile hub's "Security" tab. Extracted from the former standalone
 * SecuritySettingsPage so account settings live in one place; the
 * `/settings/security` route now redirects here.
 */
export function SecurityPanel() {
  const { t } = useTranslation()
  const { session } = useAuth()

  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled,
  )
  const isAnonymous = Boolean(
    (session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous,
  )

  const [totp, dispatchTotp] = useReducer(totpReducer, initialTotpState)
  const { step: totpStep, password: totpPassword, code: totpCode, data: totpData, busy: totpBusy } = totp

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

  return (
    <>
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
            <Button variant="outline" onClick={disableTotp} disabled={totpBusy || isAnonymous}>
              {totpBusy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {t('security.totp.disable')}
            </Button>
          ) : (
            <Button variant="gaming" onClick={startEnableTotp} disabled={totpBusy || isAnonymous}>
              {t('security.totp.enable')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* --------- Passkeys --------- */}
      <PasskeyManager isAnonymous={isAnonymous} />

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
    </>
  )
}
