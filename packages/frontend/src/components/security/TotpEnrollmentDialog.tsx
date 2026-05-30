import { useTranslation } from 'react-i18next'
import { Loader2, Copy, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Password } from '@/components/ui/password'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

  const copyBackupCodes = async (): Promise<void> => {
    if (!data) return
    await navigator.clipboard.writeText(data.backupCodes.join('\n'))
    toast.success(t('security.totp.copied'))
  }

  const downloadBackupCodes = (): void => {
    if (!data) return
    const blob = new Blob([data.backupCodes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'the-box-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={step !== 'idle'} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {step === 'password' && (
          <form onSubmit={onSubmitPassword} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('security.totp.title')}</DialogTitle>
              <DialogDescription>{t('security.totp.passwordPrompt')}</DialogDescription>
            </DialogHeader>
            <div>
              <label className="text-sm font-medium">{t('security.totp.passwordLabel')}</label>
              <Password
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('security.totp.cancel')}
              </Button>
              <Button type="submit" variant="gaming" disabled={busy || !password}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t('security.totp.continue')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'verify' && data && (
          <form onSubmit={onSubmitVerify} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('security.totp.title')}</DialogTitle>
              <DialogDescription>{t('security.totp.scanQr')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3">
              <img
                src={buildQrUrl(data.totpURI)}
                alt="TOTP QR code"
                width={220}
                height={220}
                className="rounded bg-white p-2"
              />
              <details className="text-xs text-muted-foreground w-full">
                <summary className="cursor-pointer">{t('security.totp.manualSecret')}</summary>
                <code className="block break-all mt-2 p-2 bg-card/50 rounded font-mono text-[10px]">
                  {data.totpURI}
                </code>
              </details>
            </div>
            <div>
              <label className="text-sm font-medium">{t('security.totp.codeLabel')}</label>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder={t('security.totp.codePlaceholder')}
                value={code}
                onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('security.totp.cancel')}
              </Button>
              <Button type="submit" variant="gaming" disabled={busy || code.length !== 6}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t('security.totp.verify')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'backup' && data && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('security.totp.backupCodesTitle')}</DialogTitle>
              <DialogDescription>{t('security.totp.backupCodesDescription')}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-card/50 p-3 rounded border border-white/10">
              {data.backupCodes.map((c) => (
                <div key={c} className="text-center py-1">
                  {c}
                </div>
              ))}
            </div>
            <p className="text-xs text-warning">{t('security.totp.backupCodesWarning')}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyBackupCodes} className="flex-1">
                <Copy className="size-4 mr-2" />
                {t('security.totp.copy')}
              </Button>
              <Button variant="outline" onClick={downloadBackupCodes} className="flex-1">
                <Download className="size-4 mr-2" />
                {t('security.totp.download')}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="gaming" onClick={onClose} className="w-full">
                {t('security.totp.iSavedThem')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
