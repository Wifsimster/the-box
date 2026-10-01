import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Mail, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { userApi } from '@/lib/api/user'

interface EmailConsentCardProps {
  initialConsent: boolean
  updatedAt?: string
}

export function EmailConsentCard({ initialConsent, updatedAt }: EmailConsentCardProps) {
  const { t, i18n } = useTranslation()
  const checkboxId = useId()
  const [consent, setConsent] = useState(initialConsent)
  // Local override applied only after a successful save. While null we fall
  // back to the `updatedAt` prop, so the timestamp isn't derived state.
  const [savedUpdatedAt, setSavedUpdatedAt] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const lastUpdated = savedUpdatedAt ?? updatedAt

  const handleToggle = async (next: boolean) => {
    if (isSaving || next === consent) return
    setIsSaving(true)
    const previous = consent
    setConsent(next)
    try {
      const updated = await userApi.updateEmailConsent(next)
      setSavedUpdatedAt(updated.emailConsentUpdatedAt ?? null)
      toast.success(next ? t('emailConsent.optedIn') : t('emailConsent.optedOut'))
    } catch (err) {
      setConsent(previous)
      toast.error(t('emailConsent.updateError'))
      console.error('Failed to update email consent:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString(i18n.language, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" aria-hidden="true" />
          {t('emailConsent.title')}
        </CardTitle>
        <CardDescription>{t('emailConsent.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <Checkbox
            id={checkboxId}
            checked={consent}
            disabled={isSaving}
            aria-busy={isSaving}
            onCheckedChange={(value) => handleToggle(value === true)}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-1">
            <label htmlFor={checkboxId} className="block cursor-pointer text-sm text-foreground">
              {t('emailConsent.label')}
            </label>
            <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              {isSaving && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
              {formattedDate && !isSaving && t('emailConsent.updatedOn', { date: formattedDate })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
