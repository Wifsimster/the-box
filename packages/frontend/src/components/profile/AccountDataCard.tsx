import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Download, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from '@/lib/toast'
import { userApi, UserApiError } from '@/lib/api/user'
import { useAuth } from '@/hooks/useAuth'

interface AccountDataCardProps {
  username: string
}

/**
 * GDPR / RGPD account-data controls: export (right to portability) and
 * permanent account deletion (right to erasure). The destructive delete is
 * guarded by a confirmation dialog that requires the user to re-type their
 * exact username.
 */
export function AccountDataCard({ username }: AccountDataCardProps) {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  const [isExporting, setIsExporting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmValue, setConfirmValue] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const handleExport = async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      await userApi.exportData()
    } catch (err) {
      toast.error(t('accountData.exportError'))
      console.error('Failed to export account data:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const handleDelete = async () => {
    if (isDeleting || confirmValue !== username) return
    setIsDeleting(true)
    try {
      await userApi.deleteAccount(confirmValue)
      setDialogOpen(false)
      // Clears per-user client state and redirects home.
      await signOut()
    } catch (err) {
      if (err instanceof UserApiError && err.code === 'CONFIRMATION_MISMATCH') {
        toast.error(t('accountData.deleteMismatch'))
      } else {
        toast.error(t('accountData.deleteError'))
      }
      console.error('Failed to delete account:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (isDeleting) return
    setDialogOpen(open)
    if (!open) setConfirmValue('')
  }

  const confirmMatches = confirmValue === username

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="size-5" />
          {t('accountData.title')}
        </CardTitle>
        <CardDescription>{t('accountData.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            {t('accountData.exportTitle')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('accountData.exportDescription')}
          </p>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
            className="w-full sm:w-auto"
          >
            {isExporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {isExporting ? t('accountData.exporting') : t('accountData.exportButton')}
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-error/30 bg-error/5 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-error">
            <AlertTriangle className="size-4" />
            {t('accountData.deleteTitle')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t('accountData.deleteDescription')}
          </p>
          <Button
            variant="destructive"
            onClick={() => setDialogOpen(true)}
            data-testid="delete-account-trigger"
            className="w-full sm:w-auto"
          >
            <Trash2 className="size-4" />
            {t('accountData.deleteButton')}
          </Button>
        </div>
      </CardContent>

      <ResponsiveDialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <ResponsiveDialogContent data-testid="delete-account-dialog">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('accountData.deleteDialogTitle')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('accountData.deleteDialogWarning')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-confirm-input">
              {t('accountData.deleteConfirmLabel', { username })}
            </Label>
            <Input
              id="delete-confirm-input"
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
              placeholder={t('accountData.deleteConfirmPlaceholder')}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isDeleting}
              data-testid="delete-account-confirm-input"
            />
          </div>

          <ResponsiveDialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isDeleting}
            >
              {t('accountData.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!confirmMatches || isDeleting}
              data-testid="delete-account-confirm"
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              {isDeleting
                ? t('accountData.deleting')
                : t('accountData.deleteConfirmButton')}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </Card>
  )
}
