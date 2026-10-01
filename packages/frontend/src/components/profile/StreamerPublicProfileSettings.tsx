import { useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { streamerKeysApi } from '@/lib/api/streamer-keys'

const SLUG_RE = /^[a-z0-9_-]{3,32}$/

interface StreamerPublicProfileSettingsProps {
  /** Persisted enabled flag from the server. */
  savedEnabled: boolean
  /** Persisted slug from the server (null when never set). */
  savedSlug: string | null
  /**
   * Called after a successful save so the parent can mirror the new values
   * (it gates the keys / webhooks / recipes sections on `enabled`).
   */
  onPersisted: (next: { enabled: boolean; slug: string | null }) => void
}

interface SettingsFormState {
  enabled: boolean
  slug: string
  slugError: string | null
  saving: boolean
}

type SettingsFormAction =
  | { type: 'enabledChanged'; enabled: boolean }
  | { type: 'slugChanged'; slug: string }
  | { type: 'saveStarted' }
  | { type: 'saveFailed'; slugError: string | null }
  | { type: 'saveSucceeded' }

function settingsFormReducer(
  state: SettingsFormState,
  action: SettingsFormAction,
): SettingsFormState {
  switch (action.type) {
    case 'enabledChanged':
      return { ...state, enabled: action.enabled }
    case 'slugChanged':
      return { ...state, slug: action.slug }
    case 'saveStarted':
      return { ...state, saving: true, slugError: null }
    case 'saveFailed':
      return { ...state, saving: false, slugError: action.slugError }
    case 'saveSucceeded':
      return { ...state, saving: false, slugError: null }
    default:
      return state
  }
}

/**
 * Public-profile toggle + slug editor. Owns its own form state (toggle, slug,
 * inline validation error, saving flag) and reports persisted values up via
 * `onPersisted`.
 */
export function StreamerPublicProfileSettings({
  savedEnabled,
  savedSlug,
  onPersisted,
}: StreamerPublicProfileSettingsProps) {
  const { t } = useTranslation()
  const [state, dispatch] = useReducer(settingsFormReducer, {
    enabled: savedEnabled,
    slug: savedSlug ?? '',
    slugError: null,
    saving: false,
  })
  const { enabled, slug, slugError, saving } = state

  // Persist toggle / slug. Slug validation is local-first (cheap regex) — the
  // server still re-enforces and additionally returns 409 SLUG_TAKEN on
  // collision, which we surface inline rather than as a toast.
  async function persistSettings(next: { enabled?: boolean; slug?: string | null }) {
    const targetEnabled = next.enabled ?? enabled
    const targetSlug = next.slug !== undefined ? next.slug : (slug || null)
    if (targetSlug && !SLUG_RE.test(targetSlug)) {
      dispatch({ type: 'saveFailed', slugError: t('streamerKit.slugInvalid') })
      return false
    }
    dispatch({ type: 'saveStarted' })
    try {
      await streamerKeysApi.updateSettings({
        publicProfileEnabled: targetEnabled,
        publicSlug: targetSlug ?? null,
      })
      dispatch({ type: 'saveSucceeded' })
      onPersisted({ enabled: targetEnabled, slug: targetSlug ?? null })
      return true
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'SLUG_TAKEN') {
        dispatch({ type: 'saveFailed', slugError: t('streamerKit.slugTaken') })
      } else if (code === 'SLUG_RESERVED') {
        dispatch({ type: 'saveFailed', slugError: t('streamerKit.slugReserved') })
      } else {
        dispatch({ type: 'saveFailed', slugError: null })
        toast.error(t('streamerKit.updateError'))
      }
      return false
    }
  }

  function onToggle(value: boolean) {
    dispatch({ type: 'enabledChanged', enabled: value })
    void persistSettings({ enabled: value })
  }

  const slugDirty = (savedSlug ?? '') !== slug

  function onSlugBlur() {
    if (!slugDirty) return
    void persistSettings({ slug: slug || null })
  }

  async function onSlugSaveClick() {
    if (!slugDirty) return
    await persistSettings({ slug: slug || null })
  }

  return (
    <div className="space-y-4" data-testid="streamer-kit-settings">
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          onChange={(e) => onToggle(e.target.checked)}
          data-testid="streamer-kit-toggle"
          className="mt-0.5 size-5 shrink-0 rounded border-border bg-background/50 accent-primary cursor-pointer disabled:cursor-wait"
        />
        <span className="flex-1 space-y-1">
          <span className="block text-sm text-foreground">
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
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground font-mono sm:inline">/streamers/</span>
            <Input
              id="streamer-slug"
              data-testid="streamer-kit-slug"
              value={slug}
              onChange={(e) => dispatch({ type: 'slugChanged', slug: e.target.value.toLowerCase() })}
              onBlur={onSlugBlur}
              placeholder="wifsim"
              maxLength={32}
              disabled={saving}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 sm:max-w-xs"
            />
            <Button
              variant="outline"
              className="shrink-0"
              onClick={onSlugSaveClick}
              disabled={!slugDirty || saving}
              data-testid="streamer-kit-slug-save"
            >
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('streamerKit.slugSave')}
            </Button>
          </div>
          {slugError && (
            <p role="alert" className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {slugError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t('streamerKit.slugHint')}</p>
        </div>
      )}
    </div>
  )
}
