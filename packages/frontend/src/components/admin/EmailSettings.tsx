import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminApi } from '@/lib/api/admin'
import { Mail, Loader2, CheckCircle2, XCircle, Send } from 'lucide-react'
import { toast } from '@/lib/toast'

interface EmailConfig {
  configured: boolean
  hasApiKey: boolean
  emailFrom: string
}

export function EmailSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<EmailConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      const emailConfig = await adminApi.getEmailConfig()
      setConfig(emailConfig)
    } catch (error) {
      toast.error(t('admin.email.fetchError'))
      console.error('Failed to fetch email config:', error)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchConfig()
    // Set default email to test value
    setRecipientEmail('battistella@proton.me')
  }, [fetchConfig])

  const handleTestEmail = async () => {
    if (!recipientEmail.trim()) {
      toast.error(t('admin.email.emailRequired'))
      return
    }

    try {
      setTesting(true)
      const result = await adminApi.testEmail(recipientEmail.trim())
      toast.success(t('admin.email.testSuccess', { email: result.to }))
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const apiError = error as { code: string; message: string }
        if (apiError.code === 'NOT_CONFIGURED') {
          toast.error(t('admin.email.notConfigured'))
        } else if (apiError.code === 'NO_EMAIL') {
          toast.error(t('admin.email.noEmail'))
        } else if (apiError.code === 'VALIDATION_ERROR') {
          toast.error(t('admin.email.invalidEmail'))
        } else {
          toast.error(t('admin.email.testError', { message: apiError.message }))
        }
      } else {
        toast.error(t('admin.email.testError', { message: (error as Error).message }))
      }
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-neon-purple" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-neon-purple/30">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Mail className="size-5 sm:size-6 text-neon-purple shrink-0" />
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg">{t('admin.email.title')}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{t('admin.email.description')}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 p-3 rounded-lg bg-muted/50">
            <span className="text-sm font-medium shrink-0">{t('admin.email.status')}</span>
            <div className="flex items-center gap-2 min-w-0">
              {config?.configured ? (
                <>
                  <CheckCircle2 className="size-5 text-success shrink-0" />
                  <span className="text-sm text-success truncate">{t('admin.email.configured')}</span>
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-error shrink-0" />
                  <span className="text-sm text-error truncate">{t('admin.email.notConfigured')}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 p-3 rounded-lg bg-muted/50">
            <span className="text-sm font-medium shrink-0">{t('admin.email.apiKey')}</span>
            <span className="text-sm text-muted-foreground truncate">
              {config?.hasApiKey ? t('admin.email.apiKeySet') : t('admin.email.apiKeyNotSet')}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 p-3 rounded-lg bg-muted/50">
            <span className="text-sm font-medium shrink-0">{t('admin.email.fromAddress')}</span>
            <span className="text-sm font-mono text-foreground truncate sm:text-right break-all">
              {config?.emailFrom || '-'}
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t border-border">
          <Label htmlFor="recipient-email">{t('admin.email.recipientEmail')}</Label>
          <Input
            id="recipient-email"
            type="email"
            placeholder={t('admin.email.recipientEmailPlaceholder')}
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            disabled={testing || !config?.configured}
          />
        </div>
      </CardContent>

      <CardFooter className="p-4 sm:p-6 pt-0 sm:pt-0">
        <Button
          variant="gaming"
          onClick={handleTestEmail}
          disabled={testing || !config?.configured || !recipientEmail.trim()}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              {t('admin.email.sending')}
            </>
          ) : (
            <>
              <Send className="size-4 mr-2" />
              {t('admin.email.sendTest')}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
