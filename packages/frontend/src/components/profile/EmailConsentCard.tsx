import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { userApi } from '@/lib/api/user'

interface EmailConsentCardProps {
  initialConsent: boolean
  updatedAt?: string
}

export function EmailConsentCard({ initialConsent, updatedAt }: EmailConsentCardProps) {
  const { t, i18n } = useTranslation()
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
          <Mail className="size-5" />
          {t('emailConsent.title')}
        </CardTitle>
        <CardDescription>{t('emailConsent.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-start gap-3 cursor-pointer select-none group">
          <input
            type="checkbox"
            checked={consent}
            disabled={isSaving}
            onChange={(e) => handleToggle(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-background/50 accent-neon-purple cursor-pointer disabled:cursor-wait"
          />
          <span className="flex-1 space-y-1">
            <span className="block text-sm text-foreground/90 group-hover:text-foreground transition-colors">
              {t('emailConsent.label')}
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {isSaving && <Loader2 className="size-3 animate-spin" />}
              {formattedDate && !isSaving && t('emailConsent.updatedOn', { date: formattedDate })}
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  )
}
