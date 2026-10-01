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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { authClient } from '@/lib/auth-client'
import { toast } from '@/lib/toast'

/**
 * Self-contained passkey list + add/delete flow. Better Auth's
 * nanostore-backed `useListPasskeys` keeps the list in sync with
 * register/delete events. Extracted from SecuritySettingsPage so that page
 * stays small and focused on the security overview.
 */
export function PasskeyManager({ isAnonymous }: { isAnonymous: boolean }) {
  const { t, i18n } = useTranslation()
  const passkeysAtom = authClient.useListPasskeys()
  const passkeys = passkeysAtom?.data ?? []
  const passkeysPending = passkeysAtom?.isPending ?? true
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null)
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [passkeyName, setPasskeyName] = useState('')

  const formatDate = (iso: string | Date | null | undefined): string => {
    if (!iso) return '—'
    const d = typeof iso === 'string' ? new Date(iso) : iso
    return d.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const openAddDialog = (): void => {
    setPasskeyName('')
    setNameDialogOpen(true)
  }

  const addPasskey = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setPasskeyBusy(true)
    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName.trim() || undefined,
      })
      if (result?.error) {
        toast.error(t('security.passkey.registerError'))
        return
      }
      toast.success(t('security.passkey.registerSuccess'))
      setNameDialogOpen(false)
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
            <Fingerprint className="size-5" aria-hidden="true" />
            {t('security.passkey.title')}
          </CardTitle>
          <CardDescription>{t('security.passkey.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3" aria-busy={passkeysPending}>
          {passkeysPending ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('security.passkey.empty')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {passkeys.map((pk) => {
                const label = pk.name || pk.deviceType || t('security.passkey.fallbackName')
                return (
                  <li key={pk.id} className="flex items-center justify-between gap-2 py-2 pl-4 pr-1">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{label}</div>
                      <div className="text-sm text-muted-foreground">
                        {t('security.passkey.addedOn', { date: formatDate(pk.createdAt) })}
                      </div>
                    </div>
                    <Button
                      variant="dangerGhost"
                      size="icon"
                      onClick={() => setPasskeyToDelete(pk.id)}
                      disabled={passkeyBusy}
                      aria-label={`${t('security.passkey.delete')} – ${label}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <Button
            variant="outline"
            onClick={openAddDialog}
            disabled={passkeyBusy || isAnonymous}
            className="w-full sm:w-auto"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('security.passkey.addCta')}
          </Button>
        </CardContent>
      </Card>

      <ResponsiveDialog
        open={nameDialogOpen}
        onOpenChange={(open) => !passkeyBusy && setNameDialogOpen(open)}
      >
        <ResponsiveDialogContent className="sm:max-w-sm">
          <form onSubmit={addPasskey} className="space-y-4">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{t('security.passkey.addCta')}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="passkey-name">{t('security.passkey.namePrompt')}</Label>
              <Input
                id="passkey-name"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
                maxLength={64}
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>
            <ResponsiveDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNameDialogOpen(false)}
                disabled={passkeyBusy}
              >
                {t('security.totp.cancel')}
              </Button>
              <Button type="submit" variant="gaming" disabled={passkeyBusy}>
                {passkeyBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Fingerprint className="size-4" aria-hidden="true" />
                )}
                {t('security.totp.continue')}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <ConfirmDialog
        open={passkeyToDelete !== null}
        onOpenChange={(open) => !open && !passkeyBusy && setPasskeyToDelete(null)}
        title={t('security.passkey.delete')}
        description={t('security.passkey.deleteConfirm')}
        confirmLabel={t('security.passkey.delete')}
        cancelLabel={t('security.totp.cancel')}
        destructive
        busy={passkeyBusy}
        onConfirm={confirmDeletePasskey}
      />
    </>
  )
}
