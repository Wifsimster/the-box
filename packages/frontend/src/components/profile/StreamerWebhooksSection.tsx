import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Webhook, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { StreamerWebhookCreateDialog } from './StreamerWebhookCreateDialog'
import { toast } from '@/lib/toast'
import { streamerKeysApi } from '@/lib/api/streamer-keys'
import type { WebhookSummary } from '@the-box/types'

// Webhook management — the third Streamer Kit section, below API keys.
// Self-contained: fetches its own data, owns its own dialogs. Rendered by
// StreamerKitCard only when the public profile is enabled.

interface Props {
  // Webhooks are meaningless without an opted-in public profile — the parent
  // gates rendering, but we also disable the create button defensively.
  enabled: boolean
}

export function StreamerWebhooksSection({ enabled }: Props) {
  const { t, i18n } = useTranslation()

  const [webhooks, setWebhooks] = useState<WebhookSummary[]>([])
  const [loading, setLoading] = useState(true)

  const [revokeTargetId, setRevokeTargetId] = useState<number | null>(null)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await streamerKeysApi.listWebhooks()
        if (!cancelled) setWebhooks(data)
      } catch (err) {
        console.error('Failed to load webhooks', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function onWebhookCreated(summary: WebhookSummary) {
    setWebhooks((prev) => [summary, ...prev])
  }

  async function onConfirmRevoke() {
    if (revokeTargetId === null) return
    const id = revokeTargetId
    setRevoking(true)
    try {
      await streamerKeysApi.revokeWebhook(id)
      setWebhooks((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isActive: false } : w))
      )
      setRevokeTargetId(null)
    } catch {
      toast.error(t('streamerKit.webhookRevokeError'))
    } finally {
      setRevoking(false)
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return t('streamerKit.webhookNeverDelivered')
    return new Date(iso).toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-3" data-testid="streamer-kit-webhooks">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Webhook className="size-4" />
          {t('streamerKit.webhooksTitle')}
        </h4>
        <StreamerWebhookCreateDialog
          enabled={enabled}
          onCreated={onWebhookCreated}
        />
      </div>

      <p className="text-xs text-muted-foreground">{t('streamerKit.webhooksHint')}</p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('streamerKit.loading')}
        </div>
      )}

      {!loading && webhooks.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('streamerKit.noWebhooks')}</p>
      )}

      {!loading && webhooks.length > 0 && (
        <ul className="space-y-2" data-testid="streamer-kit-webhooks-list">
          {webhooks.map((w) => (
            <li
              key={w.id}
              data-testid={`streamer-kit-webhook-${w.id}`}
              className="flex items-center justify-between rounded border border-border bg-background/30 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{w.label}</span>
                  {!w.isActive && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {t('streamerKit.revoked')}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <code className="font-mono truncate max-w-[16rem]">{w.url}</code>
                </div>
                <div className="text-xs text-muted-foreground">
                  {w.events.length === 0
                    ? t('streamerKit.webhookAllEvents')
                    : w.events.join(', ')}
                  {' · '}
                  {t('streamerKit.webhookLastDelivered', { date: formatDate(w.lastDeliveredAt) })}
                </div>
              </div>
              {w.isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevokeTargetId(w.id)}
                  aria-label={t('streamerKit.webhookRevokeAria')}
                  data-testid={`streamer-kit-revoke-webhook-${w.id}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Revoke confirmation */}
      <ConfirmDialog
        open={revokeTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTargetId(null)
        }}
        title={t('streamerKit.webhookRevokeTitle')}
        description={t('streamerKit.webhookRevokeConfirm')}
        confirmLabel={t('streamerKit.revokeConfirmButton')}
        cancelLabel={t('streamerKit.cancel')}
        destructive
        busy={revoking}
        onConfirm={onConfirmRevoke}
        testId="streamer-kit-webhook-revoke-dialog"
      />
    </div>
  )
}
