import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Settings, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { adminApi } from '@/lib/api/admin'
import type { AppSettingView } from '@/types'

type Value = boolean | number | string | null

/**
 * Admin → Paramètres. Renders every app setting from the server registry,
 * grouped, with a control per type. Secrets are write-only: the panel only
 * ever sees `{ set, mask }`, and the paste field is cleared after saving.
 */
export function SettingsPanel() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettingView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    adminApi.listSettings().then(
      (list) => {
        if (cancelled) return
        setSettings(list)
        setFailed(false)
      },
      () => {
        if (!cancelled) setFailed(true)
      }
    )
    return () => {
      cancelled = true
    }
  }, [nonce])

  const save = async (key: string, value: Value): Promise<boolean> => {
    try {
      const view = await adminApi.updateSetting(key, value)
      setSettings((prev) => prev?.map((s) => (s.key === key ? view : s)) ?? prev)
      toast.success(t('admin.appSettings.saved'))
      return true
    } catch (err) {
      toast.error(t('admin.appSettings.saveError', { message: err instanceof Error ? err.message : String(err) }))
      return false
    }
  }

  const groups = settings ? [...new Set(settings.map((s) => s.group))] : []

  return (
    <div className="space-y-4" data-testid="admin-settings">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5 min-w-0">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Settings className="size-4 text-neon-purple shrink-0" aria-hidden="true" />
              {t('admin.appSettings.title')}
            </CardTitle>
            <CardDescription>{t('admin.appSettings.intro')}</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNonce((n) => n + 1)}
            aria-label={t('admin.jobs.refresh')}
            title={t('admin.jobs.refresh')}
            className="shrink-0"
          >
            <RefreshCw className="size-4" />
          </Button>
        </CardHeader>
      </Card>

      {failed && <p role="alert" className="text-sm text-error">{t('admin.appSettings.loadError')}</p>}
      {!settings && !failed && <Skeleton className="h-64 w-full" />}

      {groups.map((group) => {
        const items = settings!.filter((s) => s.group === group)
        const enabled = items.find((s) => s.key.endsWith('.enabled'))
        const secret = items.find((s) => s.type === 'secret')
        const live = enabled?.value === true && (secret ? secret.secret?.set === true : true)
        return (
          <Card key={group} data-testid={`settings-group-${group}`}>
            <CardHeader className="space-y-2">
              <CardTitle className="text-base">{t(`admin.appSettings.groups.${group}.title`)}</CardTitle>
              <CardDescription>{t(`admin.appSettings.groups.${group}.description`)}</CardDescription>
              {enabled && (
                <p role="status" data-testid={`settings-status-${group}`}>
                  <Badge variant={live ? 'success' : 'outline'} className="text-xs font-normal whitespace-normal">
                    {t(`admin.appSettings.groups.${group}.${live ? 'active' : 'inactive'}`)}
                  </Badge>
                </p>
              )}
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {items.map((s) => (
                <SettingRow key={s.key} setting={s} onSave={save} />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function SettingRow({ setting, onSave }: { setting: AppSettingView; onSave: (key: string, value: Value) => Promise<boolean> }) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const helpId = `${id}-help`
  const label = t(`admin.appSettings.items.${setting.key}.label`, { defaultValue: setting.key })
  const help = t(`admin.appSettings.items.${setting.key}.help`, { defaultValue: '' })

  return (
    <div className="space-y-2 py-4 first:pt-0 last:pb-0" data-testid={`setting-${setting.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
          {help && (
            <p id={helpId} className="text-xs text-muted-foreground">
              {help}
            </p>
          )}
        </div>
        {setting.type === 'boolean' && (
          <BooleanControl id={id} helpId={help ? helpId : undefined} setting={setting} onSave={onSave} />
        )}
      </div>
      {setting.type === 'secret' && <SecretControl id={id} setting={setting} onSave={onSave} />}
      {(setting.type === 'string' || setting.type === 'number') && (
        <ValueControl id={id} helpId={help ? helpId : undefined} setting={setting} onSave={onSave} />
      )}
      {setting.updatedAt && (
        <p className="text-[11px] text-muted-foreground">
          {t('admin.appSettings.updated', {
            date: new Date(setting.updatedAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }),
          })}
        </p>
      )}
    </div>
  )
}

function BooleanControl({
  id,
  helpId,
  setting,
  onSave,
}: {
  id: string
  helpId?: string
  setting: AppSettingView
  onSave: (key: string, value: Value) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const on = setting.value === true
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-describedby={helpId}
      disabled={busy}
      data-testid={`toggle-${setting.key}`}
      onClick={async () => {
        setBusy(true)
        await onSave(setting.key, !on)
        setBusy(false)
      }}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-1 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        on ? 'border-success/40 bg-success/15 text-success' : 'border-border bg-background text-muted-foreground'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative block h-6 w-10 shrink-0 overflow-hidden rounded-full transition-colors',
          on ? 'bg-success' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'absolute left-0.5 top-0.5 size-5 rounded-full bg-foreground shadow transition-transform motion-reduce:transition-none',
            on ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </span>
      {on ? t('admin.appSettings.on') : t('admin.appSettings.off')}
    </button>
  )
}

function SecretControl({
  id,
  setting,
  onSave,
}: {
  id: string
  setting: AppSettingView
  onSave: (key: string, value: Value) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const statusId = `${id}-status`
  const set = setting.secret?.set === true

  const run = async (value: Value) => {
    setBusy(true)
    const ok = await onSave(setting.key, value)
    if (ok) setDraft('')
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      <p id={statusId} className="flex items-center gap-2 text-sm" data-testid={`secret-status-${setting.key}`}>
        <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {set ? (
          <span className="break-all">{t('admin.appSettings.secret.set', { mask: setting.secret?.mask ?? '' })}</span>
        ) : (
          <span className="text-muted-foreground">{t('admin.appSettings.secret.unset')}</span>
        )}
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) void run(draft.trim())
        }}
      >
        <Input
          id={id}
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('admin.appSettings.secret.placeholder')}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={statusId}
          className="font-mono sm:flex-1"
          disabled={busy}
          data-testid={`secret-input-${setting.key}`}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !draft.trim()} className="min-h-11 flex-1 sm:flex-none" data-testid={`secret-save-${setting.key}`}>
            {set ? t('admin.appSettings.secret.replace') : t('admin.appSettings.save')}
          </Button>
          {set && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="min-h-11 flex-1 sm:flex-none"
              onClick={() => void run(null)}
              data-testid={`secret-clear-${setting.key}`}
            >
              {t('admin.appSettings.secret.clear')}
            </Button>
          )}
        </div>
      </form>
      <p className="text-[11px] text-muted-foreground">{t('admin.appSettings.secret.writeOnly')}</p>
    </div>
  )
}

function ValueControl({
  id,
  helpId,
  setting,
  onSave,
}: {
  id: string
  helpId?: string
  setting: AppSettingView
  onSave: (key: string, value: Value) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const current = setting.value === null ? '' : String(setting.value)
  const [draft, setDraft] = useState(current)
  const [busy, setBusy] = useState(false)
  // Follow server updates (save, refresh) while the field is untouched.
  const [seen, setSeen] = useState(current)
  if (seen !== current) {
    setSeen(current)
    setDraft(current)
  }
  const isNumber = setting.type === 'number'
  const parsed: Value = isNumber ? (draft.trim() === '' ? null : Number(draft)) : draft.trim()
  const valid = isNumber ? typeof parsed === 'number' && Number.isFinite(parsed) : draft.trim() !== ''
  const changed = draft !== current

  const run = async (value: Value) => {
    setBusy(true)
    await onSave(setting.key, value)
    setBusy(false)
  }

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && changed) void run(parsed)
      }}
    >
      <Input
        id={id}
        type={isNumber ? 'number' : 'text'}
        inputMode={isNumber ? 'decimal' : undefined}
        step={isNumber ? 0.05 : undefined}
        min={setting.constraints?.min}
        max={setting.constraints?.max}
        maxLength={setting.constraints?.maxLength}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-describedby={helpId}
        aria-invalid={!valid || undefined}
        autoComplete="off"
        spellCheck={false}
        className={cn('sm:max-w-xs', !isNumber && 'font-mono')}
        disabled={busy}
        data-testid={`value-input-${setting.key}`}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !valid || !changed} className="min-h-11 flex-1 sm:flex-none">
          {t('admin.appSettings.save')}
        </Button>
        {setting.isSet && (
          <Button type="button" variant="ghost" disabled={busy} className="min-h-11 flex-1 sm:flex-none" onClick={() => void run(null)}>
            {t('admin.appSettings.reset')}
          </Button>
        )}
      </div>
      {setting.defaultValue !== null && (
        <span className="text-xs text-muted-foreground">
          {t('admin.appSettings.defaultValue', { value: String(setting.defaultValue) })}
        </span>
      )}
    </form>
  )
}
