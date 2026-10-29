import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Radio, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { StreamerWebhooksSection } from './StreamerWebhooksSection'
import { StreamerRecipesSection } from './StreamerRecipesSection'
import { StreamerKeyCreateDialog } from './StreamerKeyCreateDialog'
import { StreamerPublicProfileSettings } from './StreamerPublicProfileSettings'
import { toast } from '@/lib/toast'
import { streamerKeysApi, type StreamerSettingsResponse } from '@/lib/api/streamer-keys'
import type { ApiKeySummary } from '@the-box/types'

export function StreamerKitCard() {
  const { t, i18n } = useTranslation()

  const [settings, setSettings] = useState<StreamerSettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const [revokeTargetId, setRevokeTargetId] = useState<number | null>(null)
  const [revoking, setRevoking] = useState(false)

  const enabled = settings?.publicProfileEnabled ?? false

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await streamerKeysApi.getSettings()
        if (cancelled) return
        setSettings(data)
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

  function onSettingsPersisted(next: { enabled: boolean; slug: string | null }) {
    setSettings((s) =>
      s ? { ...s, publicProfileEnabled: next.enabled, publicSlug: next.slug } : s
    )
  }

  function onKeyCreated(summary: ApiKeySummary) {
    setSettings((s) => (s ? { ...s, keys: [summary, ...s.keys] } : s))
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
          <Radio className="size-5" aria-hidden="true" />
          {t('streamerKit.title')}
        </CardTitle>
        <CardDescription>{t('streamerKit.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only" role="status">{t('streamerKit.loading')}</span>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!loading && settings && (
          <>
            <StreamerPublicProfileSettings
              savedEnabled={settings.publicProfileEnabled}
              savedSlug={settings.publicSlug}
              onPersisted={onSettingsPersisted}
            />

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{t('streamerKit.keysTitle')}</h4>
                <StreamerKeyCreateDialog
                  enabled={enabled}
                  onCreated={onKeyCreated}
                />
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

            {enabled && <StreamerWebhooksSection enabled={enabled} />}

            {enabled && <StreamerRecipesSection slug={settings.publicSlug} />}
          </>
        )}
      </CardContent>

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
    </Card>
  )
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
      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/30 px-3 py-2"
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
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <code className="font-mono">{apiKey.keyPrefix}…</code>
          <span>{t('streamerKit.lastUsed', { date: formatDate(apiKey.lastUsedAt) })}</span>
        </div>
      </div>
      {apiKey.isActive && (
        <Button
          variant="dangerGhost"
          size="icon"
          className="shrink-0"
          onClick={() => onRevoke(apiKey.id)}
          aria-label={t('streamerKit.revokeAria')}
          data-testid={`streamer-kit-revoke-${apiKey.id}`}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </li>
  )
}
