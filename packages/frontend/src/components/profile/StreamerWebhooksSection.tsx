import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Webhook, Trash2, Loader2, Plus, Copy, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/lib/toast'
import { streamerKeysApi } from '@/lib/api/streamer-keys'
import type { PublicEventType, WebhookCreated, WebhookSummary } from '@the-box/types'

// Webhook management — the third Streamer Kit section, below API keys.
// Self-contained: fetches its own data, owns its own dialogs. Rendered by
// StreamerKitCard only when the public profile is enabled.

// Only session.completed is dispatched today (M2). The others are typed and
// accepted by the backend so subscribing now is forward-compatible — we tag
// them "soon" in the UI rather than hiding them.
const EVENT_OPTIONS: { value: PublicEventType; live: boolean }[] = [
  { value: 'session.completed', live: true },
  { value: 'session.started', live: false },
  { value: 'screenshot.scored', live: false },
  { value: 'rank.changed', live: false },
]

interface Props {
  // Webhooks are meaningless without an opted-in public profile — the parent
  // gates rendering, but we also disable the create button defensively.
  enabled: boolean
}

export function StreamerWebhooksSection({ enabled }: Props) {
  const { t, i18n } = useTranslation()

  const [webhooks, setWebhooks] = useState<WebhookSummary[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [events, setEvents] = useState<PublicEventType[]>(['session.completed'])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<WebhookCreated | null>(null)
  const [copied, setCopied] = useState(false)

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

  function toggleEvent(value: PublicEventType) {
    setEvents((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value]
    )
  }

  async function onCreate() {
    const trimmedUrl = url.trim()
    const trimmedLabel = label.trim()
    if (!trimmedUrl || !trimmedLabel) return
    setCreateError(null)
    setCreating(true)
    try {
      const result = await streamerKeysApi.createWebhook({
        url: trimmedUrl,
        label: trimmedLabel,
        events,
      })
      setCreated(result)
      setWebhooks((prev) => [stripSecret(result), ...prev])
      setUrl('')
      setLabel('')
      setEvents(['session.completed'])
    } catch (err) {
      const code = (err as { code?: string }).code
      // The SSRF guard returns specific codes — surface them inline so the
      // user understands *why* their URL was rejected.
      setCreateError(webhookErrorMessage(code, t))
    } finally {
      setCreating(false)
    }
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

  async function copySecret() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('streamerKit.copyError'))
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
          <Webhook className="h-4 w-4" />
          {t('streamerKit.webhooksTitle')}
        </h4>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={!enabled}
          data-testid="streamer-kit-add-webhook"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('streamerKit.addWebhook')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t('streamerKit.webhooksHint')}</p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
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
                  <Trash2 className="h-4 w-4" />
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

      {/* Create / created dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setCreated(null)
            setCreateError(null)
            setCopied(false)
          }
        }}
      >
        <DialogContent data-testid="streamer-kit-webhook-dialog">
          {!created && (
            <>
              <DialogHeader>
                <DialogTitle>{t('streamerKit.webhookDialogTitle')}</DialogTitle>
                <DialogDescription>{t('streamerKit.webhookDialogDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="wh-url" className="text-sm font-medium">
                    {t('streamerKit.webhookUrlLabel')}
                  </label>
                  <Input
                    id="wh-url"
                    data-testid="streamer-kit-webhook-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://hooks.example.com/the-box"
                    maxLength={2048}
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="wh-label" className="text-sm font-medium">
                    {t('streamerKit.keyLabelLabel')}
                  </label>
                  <Input
                    id="wh-label"
                    data-testid="streamer-kit-webhook-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t('streamerKit.webhookLabelPlaceholder')}
                    maxLength={64}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium">{t('streamerKit.webhookEventsLabel')}</span>
                  <div className="space-y-1.5">
                    {EVENT_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={events.includes(opt.value)}
                          onChange={() => toggleEvent(opt.value)}
                          className="h-4 w-4 rounded border-white/20 bg-background/50 accent-neon-purple"
                        />
                        <code className="text-xs">{opt.value}</code>
                        {!opt.live && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {t('streamerKit.webhookEventSoon')}
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('streamerKit.webhookEventsHint')}
                  </p>
                </div>
                {createError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {createError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {t('streamerKit.cancel')}
                </Button>
                <Button
                  onClick={onCreate}
                  disabled={creating || url.trim().length === 0 || label.trim().length === 0}
                  data-testid="streamer-kit-confirm-webhook"
                >
                  {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {t('streamerKit.webhookCreateButton')}
                </Button>
              </DialogFooter>
            </>
          )}

          {created && (
            <>
              <DialogHeader>
                <DialogTitle>{t('streamerKit.webhookCreatedTitle')}</DialogTitle>
                <DialogDescription>{t('streamerKit.webhookCreatedDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('streamerKit.createdOnce')}</p>
                <div className="flex items-center gap-2">
                  <code
                    data-testid="streamer-kit-webhook-secret"
                    className="flex-1 truncate rounded border border-border bg-background/50 px-2 py-1.5 font-mono text-xs"
                  >
                    {created.secret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copySecret}
                    data-testid="streamer-kit-copy-secret"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setCreateOpen(false)}>{t('streamerKit.done')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function stripSecret(c: WebhookCreated): WebhookSummary {
  const { secret: _unused, ...rest } = c
  void _unused
  return rest
}

// Maps the backend's SSRF-guard error codes to a human message.
function webhookErrorMessage(
  code: string | undefined,
  t: (key: string) => string
): string {
  switch (code) {
    case 'NOT_HTTPS':
      return t('streamerKit.webhookErrNotHttps')
    case 'PRIVATE_IP':
    case 'METADATA_IP':
    case 'BLOCKED_HOST':
    case 'OWN_HOST':
      return t('streamerKit.webhookErrBlocked')
    case 'INVALID_URL':
      return t('streamerKit.webhookErrInvalid')
    case 'TOO_MANY_WEBHOOKS':
      return t('streamerKit.webhookErrTooMany')
    default:
      return t('streamerKit.webhookErrGeneric')
  }
}
