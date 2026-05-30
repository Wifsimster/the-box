import { useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Loader2, Plus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import type { ApiKeyCreated, ApiKeySummary } from '@the-box/types'

interface StreamerKeyCreateDialogProps {
  /** Whether the public profile is enabled — gates creating new keys. */
  enabled: boolean
  /** Notifies the parent so the new key (sans plaintext) can be listed. */
  onCreated: (summary: ApiKeySummary) => void
}

// Convert the create response back to the list-summary shape (the create
// endpoint returns an ApiKeyCreated which extends ApiKeySummary, so we just
// drop the plaintext field).
function serverSummary(c: ApiKeyCreated): ApiKeySummary {
  // Destructure to strip the plaintext we never want to keep in state.
  const { plaintext: _unused, ...rest } = c
  void _unused
  return rest
}

interface CreateKeyState {
  open: boolean
  label: string
  creating: boolean
  createdKey: ApiKeyCreated | null
  copied: boolean
}

type CreateKeyAction =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'labelChanged'; label: string }
  | { type: 'createStarted' }
  | { type: 'createSucceeded'; createdKey: ApiKeyCreated }
  | { type: 'createFailed' }
  | { type: 'copied' }
  | { type: 'copyReset' }

const initialCreateKeyState: CreateKeyState = {
  open: false,
  label: '',
  creating: false,
  createdKey: null,
  copied: false,
}

function createKeyReducer(
  state: CreateKeyState,
  action: CreateKeyAction,
): CreateKeyState {
  switch (action.type) {
    case 'opened':
      return { ...state, open: true }
    case 'closed':
      return initialCreateKeyState
    case 'labelChanged':
      return { ...state, label: action.label }
    case 'createStarted':
      return { ...state, creating: true }
    case 'createSucceeded':
      return { ...state, creating: false, createdKey: action.createdKey, label: '' }
    case 'createFailed':
      return { ...state, creating: false }
    case 'copied':
      return { ...state, copied: true }
    case 'copyReset':
      return { ...state, copied: false }
    default:
      return state
  }
}

/**
 * Self-contained "create API key" affordance: owns the open/label/creating/
 * plaintext/copied state for the whole create flow, surfacing only the
 * resulting key summary back to the parent.
 */
export function StreamerKeyCreateDialog({
  enabled,
  onCreated,
}: StreamerKeyCreateDialogProps) {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(createKeyReducer, initialCreateKeyState)
  const { open, label, creating, createdKey, copied } = state

  async function onCreate() {
    const trimmed = label.trim()
    if (!trimmed) return
    dispatch({ type: 'createStarted' })
    try {
      const created = await streamerKeysApi.createKey(trimmed)
      dispatch({ type: 'createSucceeded', createdKey: created })
      onCreated(serverSummary(created))
    } catch (err) {
      const code = (err as { code?: string }).code
      toast.error(
        code === 'TOO_MANY_KEYS'
          ? t('streamerKit.tooManyKeys')
          : t('streamerKit.createError')
      )
      dispatch({ type: 'createFailed' })
    }
  }

  async function copyPlaintext() {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.plaintext)
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
        data-testid="streamer-kit-create-key"
      >
        <Plus className="size-4 mr-1" />
        {t('streamerKit.createKey')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          dispatch(next ? { type: 'opened' } : { type: 'closed' })
        }}
      >
        <DialogContent data-testid="streamer-kit-create-dialog">
          {!createdKey && (
            <>
              <DialogHeader>
                <DialogTitle>{t('streamerKit.createDialogTitle')}</DialogTitle>
                <DialogDescription>{t('streamerKit.createDialogDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label htmlFor="create-label" className="text-sm font-medium">
                  {t('streamerKit.keyLabelLabel')}
                </label>
                <Input
                  id="create-label"
                  data-testid="streamer-kit-key-label"
                  value={label}
                  onChange={(e) => dispatch({ type: 'labelChanged', label: e.target.value })}
                  placeholder={t('streamerKit.keyLabelPlaceholder')}
                  maxLength={64}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => dispatch({ type: 'closed' })}>
                  {t('streamerKit.cancel')}
                </Button>
                <Button
                  onClick={onCreate}
                  disabled={creating || label.trim().length === 0}
                  data-testid="streamer-kit-confirm-create"
                >
                  {creating && <Loader2 className="size-4 mr-1 animate-spin" />}
                  {t('streamerKit.confirmCreate')}
                </Button>
              </DialogFooter>
            </>
          )}

          {createdKey && (
            <>
              <DialogHeader>
                <DialogTitle>{t('streamerKit.createdTitle')}</DialogTitle>
                <DialogDescription>{t('streamerKit.createdDesc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('streamerKit.createdOnce')}</p>
                <div className="flex items-center gap-2">
                  <code
                    data-testid="streamer-kit-key-plaintext"
                    className="flex-1 truncate rounded border border-border bg-background/50 px-2 py-1.5 font-mono text-xs"
                  >
                    {createdKey.plaintext}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyPlaintext}
                    data-testid="streamer-kit-copy"
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
