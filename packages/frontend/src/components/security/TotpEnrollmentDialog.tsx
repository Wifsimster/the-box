import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Copy, Download, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Password } from '@/components/ui/password'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { toast } from '@/lib/toast'

export type TotpEnrollment = { totpURI: string; backupCodes: string[] }
export type TotpStep = 'idle' | 'password' | 'verify' | 'backup'

function buildQrUrl(totpUri: string): string {
  // Google Charts is gone; use a small inline-friendly QR API. We avoid
  // shipping a QR lib just for the enrollment screen — the URI is also
  // shown as text so users with strict CSP / offline auth apps still work.
  const encoded = encodeURIComponent(totpUri)
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encoded}`
}

function extractSecret(totpUri: string): string | null {
  try {
    return new URL(totpUri).searchParams.get('secret')
  } catch {
    return null
  }
}

/**
 * Multi-step TOTP enrollment modal (password → QR verify → backup codes).
 * Extracted from SecuritySettingsPage so that page stays focused on the
 * security overview and 2FA/passkey orchestration.
 */
export function TotpEnrollmentDialog({
  step,
  password,
  code,
  data,
  busy,
  onPasswordChange,
  onCodeChange,
  onSubmitPassword,
  onSubmitVerify,
  onClose,
}: {
  step: TotpStep
  password: string
  code: string
  data: TotpEnrollment | null
  busy: boolean
  onPasswordChange: (value: string) => void
  onCodeChange: (value: string) => void
  onSubmitPassword: (e: React.FormEvent) => void
  onSubmitVerify: (e: React.FormEvent) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const secret = useMemo(() => (data ? extractSecret(data.totpURI) : null), [data])

  const copyText = async (text: string, successKey: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t(successKey))
    } catch {
      toast.error(t('common.error'))
    }
  }

  const downloadBackupCodes = (): void => {
    if (!data) return
    const blob = new Blob([data.backupCodes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'the-box-backup-codes.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <ResponsiveDialog open={step !== 'idle'} onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent
        className="sm:max-w-md"
        // Backup codes are shown only once: a stray tap on the backdrop must
        // not throw them away. The explicit "I saved them" button closes.
        onInteractOutside={(e) => {
          if (step === 'backup') e.preventDefault()
        }}
      >
        {step === 'password' && (
          <form onSubmit={onSubmitPassword} className="space-y-4">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t('security.totp.title')}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t('security.totp.passwordPrompt')}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="totp-password">{t('security.totp.passwordLabel')}</Label>
              <Password
                id="totp-password"
                name="password"
                autoComplete="current-password"
                enterKeyHint="go"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                required
                autoFocus
              />
            </div>
            <ResponsiveDialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('security.totp.cancel')}
              </Button>
              <Button type="submit" variant="gaming" disabled={busy || !password}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {t('security.totp.continue')}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        )}

        {step === 'verify' && data && (
          <form onSubmit={onSubmitVerify} className="space-y-4">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t('security.totp.title')}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t('security.totp.scanQr')}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="flex flex-col items-center gap-3">
              <img
                src={buildQrUrl(data.totpURI)}
                alt={t('security.totp.qrAlt')}
                width={220}
                height={220}
                className="size-44 rounded-lg bg-white p-2 sm:size-[220px]"
              />
              <Button variant="outline" className="w-full" asChild>
                <a href={data.totpURI}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {t('security.totp.openInApp')}
                </a>
              </Button>
              {secret && (
                <div className="w-full space-y-1">
                  <p className="text-sm text-muted-foreground">{t('security.totp.manualSecret')}</p>
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 pl-3">
                    <code className="min-w-0 flex-1 break-all py-2 font-mono text-sm">{secret}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void copyText(secret, 'security.totp.secretCopied')}
                      aria-label={t('security.totp.copySecret')}
                    >
                      <Copy className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-code">{t('security.totp.codeLabel')}</Label>
              <Input
                id="totp-code"
                name="totp"
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="done"
                pattern="\d{6}"
                maxLength={6}
                placeholder={t('security.totp.codePlaceholder')}
                value={code}
                onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ''))}
                required
                className="text-center font-mono text-lg tracking-[0.3em] md:text-lg"
              />
            </div>
            <ResponsiveDialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('security.totp.cancel')}
              </Button>
              <Button type="submit" variant="gaming" disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {t('security.totp.verify')}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        )}

        {step === 'backup' && data && (
          <div className="space-y-4">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t('security.totp.backupCodesTitle')}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t('security.totp.backupCodesDescription')}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <ul className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-3 font-mono text-sm">
              {data.backupCodes.map((c) => (
                <li key={c} className="py-1 text-center">
                  {c}
                </li>
              ))}
            </ul>
            <p className="text-sm text-warning">{t('security.totp.backupCodesWarning')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void copyText(data.backupCodes.join('\n'), 'security.totp.copied')}>
                <Copy className="size-4" aria-hidden="true" />
                {t('security.totp.copy')}
              </Button>
              <Button variant="outline" onClick={downloadBackupCodes}>
                <Download className="size-4" aria-hidden="true" />
                {t('security.totp.download')}
              </Button>
            </div>
            <ResponsiveDialogFooter>
              <Button variant="gaming" size="lg" onClick={onClose} className="w-full">
                {t('security.totp.iSavedThem')}
              </Button>
            </ResponsiveDialogFooter>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
