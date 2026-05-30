import { useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Copy, Check, Loader2, AlertTriangle } from 'lucide-react'
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
import { toast } from '@/lib/toast'
import { streamerKeysApi } from '@/lib/api/streamer-keys'
import type { PublicEventType, WebhookCreated, WebhookSummary } from '@the-box/types'

// session.started, session.completed and rank.changed are dispatched as
// webhooks. screenshot.scored is SSE-only (not delivered as a webhook) — it
// gets a "soon" badge rather than being hidden, so a subscription that
// includes it stays forward-compatible.
const EVENT_OPTIONS: { value: PublicEventType; live: boolean }[] = [
  { value: 'session.started', live: true },
  { value: 'session.completed', live: true },
  { value: 'rank.changed', live: true },
  { value: 'screenshot.scored', live: false },
]

interface StreamerWebhookCreateDialogProps {
  // Webhooks are meaningless without an opted-in public profile — the parent
  // gates rendering, but we also disable the create button defensively.
  enabled: boolean
  /** Notifies the parent so the new webhook (sans secret) can be listed. */
  onCreated: (summary: WebhookSummary) => void
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

interface CreateWebhookState {
  open: boolean
  url: string
  label: string
  events: PublicEventType[]
  creating: boolean
  createError: string | null
  created: WebhookCreated | null
  copied: boolean
}

type CreateWebhookAction =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'urlChanged'; url: string }
  | { type: 'labelChanged'; label: string }
  | { type: 'eventToggled'; event: PublicEventType }
  | { type: 'createStarted' }
  | { type: 'createSucceeded'; created: WebhookCreated }
  | { type: 'createFailed'; error: string }
  | { type: 'copied' }
  | { type: 'copyReset' }

const initialCreateWebhookState: CreateWebhookState = {
  open: false,
  url: '',
  label: '',
  events: ['session.completed'],
  creating: false,
  createError: null,
  created: null,
  copied: false,
}

function createWebhookReducer(
  state: CreateWebhookState,
  action: CreateWebhookAction,
): CreateWebhookState {
  switch (action.type) {
    case 'opened':
      return { ...state, open: true }
    case 'closed':
      return initialCreateWebhookState
    case 'urlChanged':
      return { ...state, url: action.url }
    case 'labelChanged':
      return { ...state, label: action.label }
    case 'eventToggled':
      return {
        ...state,
        events: state.events.includes(action.event)
          ? state.events.filter((e) => e !== action.event)
          : [...state.events, action.event],
      }
    case 'createStarted':
      return { ...state, creating: true, createError: null }
    case 'createSucceeded':
      return {
        ...state,
        creating: false,
        created: action.created,
        url: '',
        label: '',
        events: ['session.completed'],
      }
    case 'createFailed':
      return { ...state, creating: false, createError: action.error }
    case 'copied':
      return { ...state, copied: true }
    case 'copyReset':
      return { ...state, copied: false }
    default:
      return state
  }
}

/**
 * Self-contained "add webhook" affordance: owns the entire create flow state
 * (open / url / label / events / creating / error / secret / copied) and
 * surfaces only the created webhook summary back to the parent.
 */
export function StreamerWebhookCreateDialog({
  enabled,
  onCreated,
}: StreamerWebhookCreateDialogProps) {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(
    createWebhookReducer,
    initialCreateWebhookState,
  )
  const { open, url, label, events, creating, createError, created, copied } = state

  async function onCreate() {
    const trimmedUrl = url.trim()
    const trimmedLabel = label.trim()
    if (!trimmedUrl || !trimmedLabel) return
    dispatch({ type: 'createStarted' })
    try {
      const result = await streamerKeysApi.createWebhook({
        url: trimmedUrl,
        label: trimmedLabel,
        events,
      })
      dispatch({ type: 'createSucceeded', created: result })
      onCreated(stripSecret(result))
    } catch (err) {
      const code = (err as { code?: string }).code
      // The SSRF guard returns specific codes — surface them inline so the
      // user understands *why* their URL was rejected.
      dispatch({ type: 'createFailed', error: webhookErrorMessage(code, t) })
    }
  }

  async function copySecret() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.secret)
      dispatch({ type: 'copied' })
      setTimeout(() => dispatch({ type: 'copyReset' }), 2000)
    } catch {
      toast.error(t('streamerKit.copyError'))
    }
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => dispatch({ type: 'opened' })}
        disabled={!enabled}
        data-testid="streamer-kit-add-webhook"
      >
        <Plus className="size-4 mr-1" />
        {t('streamerKit.addWebhook')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          dispatch(next ? { type: 'opened' } : { type: 'closed' })
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
                    onChange={(e) => dispatch({ type: 'urlChanged', url: e.target.value })}
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
                    onChange={(e) => dispatch({ type: 'labelChanged', label: e.target.value })}
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
                          onChange={() => dispatch({ type: 'eventToggled', event: opt.value })}
                          className="size-4 rounded border-white/20 bg-background/50 accent-neon-purple"
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
                    <AlertTriangle className="size-3" />
                    {createError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => dispatch({ type: 'closed' })}>
                  {t('streamerKit.cancel')}
                </Button>
                <Button
                  onClick={onCreate}
                  disabled={creating || url.trim().length === 0 || label.trim().length === 0}
                  data-testid="streamer-kit-confirm-webhook"
                >
                  {creating && <Loader2 className="size-4 mr-1 animate-spin" />}
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
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => dispatch({ type: 'closed' })}>{t('streamerKit.done')}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
