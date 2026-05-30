import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Fingerprint, Loader2, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { authClient } from '@/lib/auth-client'
import { toast } from '@/lib/toast'

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'fr'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Self-contained passkey list + add/delete flow. Better Auth's
 * nanostore-backed `useListPasskeys` keeps the list in sync with
 * register/delete events. Extracted from SecuritySettingsPage so that page
 * stays small and focused on the security overview.
 */
export function PasskeyManager({ isAnonymous }: { isAnonymous: boolean }) {
  const { t } = useTranslation()
  const passkeysAtom = authClient.useListPasskeys()
  const passkeys = passkeysAtom?.data ?? []
  const passkeysPending = passkeysAtom?.isPending ?? true
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null)

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

  return (
    <>
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
            <p className="text-sm text-muted-foreground">{t('security.passkey.empty')}</p>
          ) : (
            <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
              {passkeys.map((pk) => (
                <li key={pk.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {pk.name || pk.deviceType || 'Passkey'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('security.passkey.addedOn', { date: formatDate(pk.createdAt) })}
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

      {/* Passkey delete confirm */}
      <Dialog
        open={passkeyToDelete !== null}
        onOpenChange={(open) => !open && setPasskeyToDelete(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('security.passkey.delete')}</DialogTitle>
            <DialogDescription>{t('security.passkey.deleteConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasskeyToDelete(null)}>
              {t('security.totp.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDeletePasskey} disabled={passkeyBusy}>
              {passkeyBusy ? <Loader2 className="size-4 animate-spin" /> : t('security.passkey.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
