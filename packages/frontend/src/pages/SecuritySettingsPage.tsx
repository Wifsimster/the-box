import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import {
  Shield,
  KeyRound,
  Fingerprint,
  Loader2,
  Trash2,
  Plus,
  Copy,
  Download,
  ChevronLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Password } from '@/components/ui/password'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { authClient } from '@/lib/auth-client'
import { useAuth } from '@/hooks/useAuth'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { toast } from '@/lib/toast'

type TotpEnrollment = { totpURI: string; backupCodes: string[] }

function buildQrUrl(totpUri: string): string {
  // Google Charts is gone; use a small inline-friendly QR API. We avoid
  // shipping a QR lib just for the enrollment screen — the URI is also
  // shown as text so users with strict CSP / offline auth apps still work.
  const encoded = encodeURIComponent(totpUri)
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encoded}`
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
  const [totpStep, setTotpStep] = useState<'idle' | 'password' | 'verify' | 'backup'>('idle')
  const [totpPassword, setTotpPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpData, setTotpData] = useState<TotpEnrollment | null>(null)
  const [totpBusy, setTotpBusy] = useState(false)

  // ---------- Passkeys ----------
  // Better Auth's nanostore-backed hook keeps the list in sync with
  // delete/register events automatically.
  const passkeysAtom = authClient.useListPasskeys()
  const passkeys = passkeysAtom?.data ?? []
  const passkeysPending = passkeysAtom?.isPending ?? true
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (!isPending && !session) {
      navigate(localizedPath('/login'))
    }
  }, [isPending, session, navigate, localizedPath])

  const isAnonymous = Boolean(
    (session?.user as { isAnonymous?: boolean } | undefined)?.isAnonymous,
  )

  const startEnableTotp = (): void => {
    setTotpPassword('')
    setTotpCode('')
    setTotpData(null)
    setTotpStep('password')
  }

  const submitTotpPassword = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setTotpBusy(true)
    try {
      const result = await authClient.twoFactor.enable({ password: totpPassword })
      if (result.error || !result.data) {
        toast.error(result.error?.message ?? t('security.totp.disabledError'))
        setTotpBusy(false)
        return
      }
      const data = result.data as TotpEnrollment
      setTotpData(data)
      setTotpStep('verify')
    } finally {
      setTotpBusy(false)
    }
  }

  const submitTotpVerify = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setTotpBusy(true)
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totpCode.trim() })
      if (result.error) {
        toast.error(t('security.totp.verifyError'))
        setTotpBusy(false)
        return
      }
      toast.success(t('security.totp.verifySuccess'))
      setTotpStep('backup')
    } finally {
      setTotpBusy(false)
    }
  }

  const closeTotpDialog = (): void => {
    setTotpStep('idle')
    setTotpPassword('')
    setTotpCode('')
    setTotpData(null)
  }

  const disableTotp = async (): Promise<void> => {
    const password = window.prompt(t('security.totp.passwordPrompt'))
    if (!password) return
    setTotpBusy(true)
    try {
      const result = await authClient.twoFactor.disable({ password })
      if (result.error) {
        toast.error(t('security.totp.disabledError'))
        return
      }
      toast.success(t('security.totp.disabledSuccess'))
    } finally {
      setTotpBusy(false)
    }
  }

  const copyBackupCodes = async (): Promise<void> => {
    if (!totpData) return
    await navigator.clipboard.writeText(totpData.backupCodes.join('\n'))
    toast.success(t('security.totp.copied'))
  }

  const downloadBackupCodes = (): void => {
    if (!totpData) return
    const blob = new Blob([totpData.backupCodes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'the-box-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const addPasskey = async (): Promise<void> => {
    const name = window.prompt(t('security.passkey.namePrompt'))
    if (name === null) return
    setPasskeyBusy(true)
    try {
      const result = await authClient.passkey.addPasskey({
        name: name.trim() || undefined,
      })
      if (result?.error) {
        toast.error(t('security.passkey.registerError'))
        return
      }
      toast.success(t('security.passkey.registerSuccess'))
    } catch {
      toast.error(t('security.passkey.registerError'))
    } finally {
      setPasskeyBusy(false)
    }
  }

  const confirmDeletePasskey = async (): Promise<void> => {
    if (!passkeyToDelete) return
    setPasskeyBusy(true)
    try {
      // deletePasskey is exposed on the underlying client even though it is not
      // typed on the `passkey.*` namespace — invoke via the auto-generated path.
      const result = await (authClient as unknown as {
        passkey: { deletePasskey: (opts: { id: string }) => Promise<{ error?: unknown }> }
      }).passkey.deletePasskey({ id: passkeyToDelete })
      if (result?.error) {
        toast.error(t('security.passkey.deleteError'))
        return
      }
      toast.success(t('security.passkey.deleteSuccess'))
    } catch {
      toast.error(t('security.passkey.deleteError'))
    } finally {
      setPasskeyBusy(false)
      setPasskeyToDelete(null)
    }
  }

  const formatDate = useMemo(() => {
    const lang = (typeof navigator !== 'undefined' && navigator.language) || 'fr'
    return (iso: string | Date | null | undefined): string => {
      if (!iso) return '—'
      const d = typeof iso === 'string' ? new Date(iso) : iso
      return d.toLocaleDateString(lang, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    }
  }, [])

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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="size-5" />
              {t('security.passkey.title')}
            </CardTitle>
            <CardDescription>{t('security.passkey.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {passkeysPending ? (
              <Skeleton className="h-10 w-full" />
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('security.passkey.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
                {passkeys.map((pk) => (
                  <li
                    key={pk.id}
                    className="flex items-center justify-between gap-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {pk.name || pk.deviceType || 'Passkey'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('security.passkey.addedOn', {
                          date: formatDate(pk.createdAt),
                        })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPasskeyToDelete(pk.id)}
                      disabled={passkeyBusy}
                      aria-label={t('security.passkey.delete')}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="gaming"
              onClick={addPasskey}
              disabled={passkeyBusy || isAnonymous}
              className="w-full sm:w-auto"
            >
              {passkeyBusy ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Plus className="size-4 mr-2" />
              )}
              {t('security.passkey.addCta')}
            </Button>
          </CardContent>
        </Card>
      </m.div>

      {/* ---------- TOTP enrollment dialog ---------- */}
      <Dialog open={totpStep !== 'idle'} onOpenChange={(open) => !open && closeTotpDialog()}>
        <DialogContent className="max-w-md">
          {totpStep === 'password' && (
            <form onSubmit={submitTotpPassword} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{t('security.totp.title')}</DialogTitle>
                <DialogDescription>
                  {t('security.totp.passwordPrompt')}
                </DialogDescription>
              </DialogHeader>
              <div>
                <label className="text-sm font-medium">
                  {t('security.totp.passwordLabel')}
                </label>
                <Password
                  value={totpPassword}
                  onChange={(e) => setTotpPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeTotpDialog}>
                  {t('security.totp.cancel')}
                </Button>
                <Button type="submit" variant="gaming" disabled={totpBusy || !totpPassword}>
                  {totpBusy ? <Loader2 className="size-4 animate-spin" /> : t('security.totp.continue')}
                </Button>
              </DialogFooter>
            </form>
          )}

          {totpStep === 'verify' && totpData && (
            <form onSubmit={submitTotpVerify} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{t('security.totp.title')}</DialogTitle>
                <DialogDescription>{t('security.totp.scanQr')}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <img
                  src={buildQrUrl(totpData.totpURI)}
                  alt="TOTP QR code"
                  width={220}
                  height={220}
                  className="rounded bg-white p-2"
                />
                <details className="text-xs text-muted-foreground w-full">
                  <summary className="cursor-pointer">
                    {t('security.totp.manualSecret')}
                  </summary>
                  <code className="block break-all mt-2 p-2 bg-card/50 rounded font-mono text-[10px]">
                    {totpData.totpURI}
                  </code>
                </details>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t('security.totp.codeLabel')}
                </label>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder={t('security.totp.codePlaceholder')}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeTotpDialog}>
                  {t('security.totp.cancel')}
                </Button>
                <Button type="submit" variant="gaming" disabled={totpBusy || totpCode.length !== 6}>
                  {totpBusy ? <Loader2 className="size-4 animate-spin" /> : t('security.totp.verify')}
                </Button>
              </DialogFooter>
            </form>
          )}

          {totpStep === 'backup' && totpData && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{t('security.totp.backupCodesTitle')}</DialogTitle>
                <DialogDescription>
                  {t('security.totp.backupCodesDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-card/50 p-3 rounded border border-white/10">
                {totpData.backupCodes.map((code) => (
                  <div key={code} className="text-center py-1">
                    {code}
                  </div>
                ))}
              </div>
              <p className="text-xs text-warning">
                {t('security.totp.backupCodesWarning')}
              </p>
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
                <Button variant="gaming" onClick={closeTotpDialog} className="w-full">
                  {t('security.totp.iSavedThem')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Passkey delete confirm ---------- */}
      <Dialog
        open={passkeyToDelete !== null}
        onOpenChange={(open) => !open && setPasskeyToDelete(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('security.passkey.delete')}</DialogTitle>
            <DialogDescription>
              {t('security.passkey.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasskeyToDelete(null)}>
              {t('security.totp.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeletePasskey}
              disabled={passkeyBusy}
            >
              {passkeyBusy ? <Loader2 className="size-4 animate-spin" /> : t('security.passkey.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
