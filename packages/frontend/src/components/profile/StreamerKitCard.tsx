import { useEffect, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Radio, Copy, Trash2, Loader2, AlertTriangle, Plus, Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { streamerKeysApi, type StreamerSettingsResponse } from '@/lib/api/streamer-keys'
import type { ApiKeyCreated, ApiKeySummary } from '@the-box/types'

const SLUG_RE = /^[a-z0-9_-]{3,32}$/

export function StreamerKitCard() {
  const { t, i18n } = useTranslation()

  const [settings, setSettings] = useState<StreamerSettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [slug, setSlug] = useState('')
  const [slugError, setSlugError] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createLabel, setCreateLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null)
  const [copied, setCopied] = useState(false)

  // Revoke-confirmation state. `revokeTargetId` doubles as the open flag
  // and as the id to revoke when the user confirms — null means closed.
  const [revokeTargetId, setRevokeTargetId] = useState<number | null>(null)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await streamerKeysApi.getSettings()
        if (cancelled) return
        setSettings(data)
        setEnabled(data.publicProfileEnabled)
        setSlug(data.publicSlug ?? '')
      } catch (err) {
        console.error('Failed to load streamer settings', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Persist toggle / slug. Slug validation is local-first (cheap regex) — the
  // server still re-enforces and additionally returns 409 SLUG_TAKEN on
  // collision, which we surface inline rather than as a toast.
  async function persistSettings(next: { enabled?: boolean; slug?: string | null }) {
    const targetEnabled = next.enabled ?? enabled
    const targetSlug = next.slug !== undefined ? next.slug : (slug || null)
    if (targetSlug && !SLUG_RE.test(targetSlug)) {
      setSlugError(t('streamerKit.slugInvalid'))
      return false
    }
    setSlugError(null)
    setSavingSettings(true)
    try {
      await streamerKeysApi.updateSettings({
        publicProfileEnabled: targetEnabled,
        publicSlug: targetSlug ?? null,
      })
      setSettings((s) =>
        s ? { ...s, publicProfileEnabled: targetEnabled, publicSlug: targetSlug ?? null } : s
      )
      return true
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'SLUG_TAKEN') {
        setSlugError(t('streamerKit.slugTaken'))
      } else {
        toast.error(t('streamerKit.updateError'))
      }
      return false
    } finally {
      setSavingSettings(false)
    }
  }

  function onToggle(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.checked
    setEnabled(value)
    void persistSettings({ enabled: value })
  }

  function onSlugBlur() {
    if ((settings?.publicSlug ?? '') === slug) return
    void persistSettings({ slug: slug || null })
  }

  const slugDirty = (settings?.publicSlug ?? '') !== slug

  async function onSlugSaveClick() {
    if (!slugDirty) return
    await persistSettings({ slug: slug || null })
  }

  async function onCreate() {
    const trimmed = createLabel.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      const created = await streamerKeysApi.createKey(trimmed)
      setCreatedKey(created)
      setCreateLabel('')
      // Refresh the list so the new key (sans plaintext) shows up below.
      setSettings((s) =>
        s ? { ...s, keys: [serverSummary(created), ...s.keys] } : s
      )
    } catch (err) {
      const code = (err as { code?: string }).code
      toast.error(
        code === 'TOO_MANY_KEYS'
          ? t('streamerKit.tooManyKeys')
          : t('streamerKit.createError')
      )
    } finally {
      setCreating(false)
    }
  }

  function onRequestRevoke(id: number) {
    setRevokeTargetId(id)
  }

  async function onConfirmRevoke() {
    if (revokeTargetId === null) return
    const id = revokeTargetId
    setRevoking(true)
    try {
      await streamerKeysApi.revokeKey(id)
      setSettings((s) =>
        s
          ? {
              ...s,
              keys: s.keys.map((k) => (k.id === id ? { ...k, isActive: false } : k)),
            }
          : s
      )
      setRevokeTargetId(null)
    } catch {
      toast.error(t('streamerKit.revokeError'))
    } finally {
      setRevoking(false)
    }
  }

  async function copyPlaintext() {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.plaintext)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('streamerKit.copyError'))
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          {t('streamerKit.title')}
        </CardTitle>
        <CardDescription>{t('streamerKit.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('streamerKit.loading')}
          </div>
        )}

        {!loading && settings && (
          <>
            {/* Public profile toggle + slug */}
            <div className="space-y-4" data-testid="streamer-kit-settings">
              <label className="flex items-start gap-3 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={savingSettings}
                  onChange={onToggle}
                  data-testid="streamer-kit-toggle"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-background/50 accent-neon-purple cursor-pointer disabled:cursor-wait"
                />
                <span className="flex-1 space-y-1">
                  <span className="block text-sm text-foreground/90 group-hover:text-foreground transition-colors">
                    {t('streamerKit.toggleLabel')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t('streamerKit.togglePrivacy')}
                  </span>
                </span>
              </label>

              {enabled && (
                <div className="space-y-1">
                  <label htmlFor="streamer-slug" className="block text-sm font-medium">
                    {t('streamerKit.slugLabel')}
                  </label>
                  {/* Mobile users routinely tap "Create key" before blur fires
                      on the slug input, so an explicit Save button is the
                      reliable affordance. onBlur is still wired as a
                      desktop-convenience fallback. */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground font-mono">/streamers/</span>
                    <Input
                      id="streamer-slug"
                      data-testid="streamer-kit-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      onBlur={onSlugBlur}
                      placeholder="wifsim"
                      maxLength={32}
                      disabled={savingSettings}
                      className="max-w-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onSlugSaveClick}
                      disabled={!slugDirty || savingSettings}
                      data-testid="streamer-kit-slug-save"
                    >
                      {savingSettings && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      {t('streamerKit.slugSave')}
                    </Button>
                  </div>
                  {slugError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {slugError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{t('streamerKit.slugHint')}</p>
                </div>
              )}
            </div>

            {/* Keys list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{t('streamerKit.keysTitle')}</h4>
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  disabled={!enabled}
                  data-testid="streamer-kit-create-key"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {t('streamerKit.createKey')}
                </Button>
              </div>

              {!enabled && (
                <p className="text-xs text-muted-foreground">{t('streamerKit.enableFirst')}</p>
              )}

              {enabled && settings.keys.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('streamerKit.noKeys')}</p>
              )}

              {enabled && settings.keys.length > 0 && (
                <ul className="space-y-2" data-testid="streamer-kit-keys-list">
                  {settings.keys.map((k) => (
                    <KeyRow
                      key={k.id}
                      apiKey={k}
                      onRevoke={onRequestRevoke}
                      formatDate={formatDate}
                    />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>

      {/* Revoke confirmation — destructive variant; replaces the previous
          window.confirm() so the UX matches the rest of the settings page. */}
      <ConfirmDialog
        open={revokeTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTargetId(null)
        }}
        title={t('streamerKit.revokeTitle')}
        description={t('streamerKit.revokeConfirm')}
        confirmLabel={t('streamerKit.revokeConfirmButton')}
        cancelLabel={t('streamerKit.cancel')}
        destructive
        busy={revoking}
        onConfirm={onConfirmRevoke}
        testId="streamer-kit-revoke-dialog"
      />

      {/* Create key dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setCreatedKey(null)
            setCreateLabel('')
            setCopied(false)
          }
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
                  value={createLabel}
                  onChange={(e) => setCreateLabel(e.target.value)}
                  placeholder={t('streamerKit.keyLabelPlaceholder')}
                  maxLength={64}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  {t('streamerKit.cancel')}
                </Button>
                <Button
                  onClick={onCreate}
                  disabled={creating || createLabel.trim().length === 0}
                  data-testid="streamer-kit-confirm-create"
                >
                  {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
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
    </Card>
  )
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

interface KeyRowProps {
  apiKey: ApiKeySummary
  onRevoke: (id: number) => void
  formatDate: (iso: string | null) => string
}

function KeyRow({ apiKey, onRevoke, formatDate }: KeyRowProps) {
  const { t } = useTranslation()
  return (
    <li
      data-testid={`streamer-kit-key-${apiKey.id}`}
      className="flex items-center justify-between rounded border border-border bg-background/30 px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{apiKey.label}</span>
          {apiKey.mode === 'test' && (
            <Badge variant="outline" className="text-[10px]">
              test
            </Badge>
          )}
          {!apiKey.isActive && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {t('streamerKit.revoked')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <code className="font-mono">{apiKey.keyPrefix}…</code>
          <span>{t('streamerKit.lastUsed', { date: formatDate(apiKey.lastUsedAt) })}</span>
        </div>
      </div>
      {apiKey.isActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(apiKey.id)}
          aria-label={t('streamerKit.revokeAria')}
          data-testid={`streamer-kit-revoke-${apiKey.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </li>
  )
}
