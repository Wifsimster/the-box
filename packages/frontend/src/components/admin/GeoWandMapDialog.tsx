import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

// Wand tier in the geo_map ingestion cascade. Admin pastes a wand.com map
// page URL; the server scrapes the page's og:image to record the map.
// Synchronous: the admin sees success/failure immediately and can fall back
// to the manual upload dialog if Wand served a Cloudflare challenge.

interface GeoWandMapDialogProps {
  isOpen: boolean
  onClose: () => void
  game: { id: number; name: string; slug: string; hasMap: boolean } | null
  onSuccess: () => void
}

interface FormState {
  wandUrl: string
  region: string
}

function defaultFormFor(slug: string | undefined): FormState {
  return {
    wandUrl: slug ? `https://wand.com/maps/${encodeURIComponent(slug)}` : '',
    region: '',
  }
}

export function GeoWandMapDialog({
  isOpen,
  onClose,
  game,
  onSuccess,
}: GeoWandMapDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(defaultFormFor(game?.slug))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setForm(defaultFormFor(game?.slug))
      setError(null)
    }
  }, [isOpen, game?.id, game?.slug])

  if (!game) return null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    if (submitting) return
    setError(null)
    if (!form.wandUrl) {
      setError(t('admin.geo.wandMap.errors.required'))
      return
    }
    if (!/^https?:\/\/(?:[^/]+\.)?wand\.com\//i.test(form.wandUrl)) {
      setError(t('admin.geo.wandMap.errors.notWandUrl'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/geo/maps/wand', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          wandUrl: form.wandUrl,
          region: form.region.trim() || undefined,
          replaceActive: game.hasMap,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean
        error?: { code?: string; message?: string }
      }
      if (!res.ok || !json.success) {
        throw new Error(
          json.error?.message ?? json.error?.code ?? `request failed: ${res.status}`,
        )
      }
      onSuccess()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-sm sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('admin.geo.wandMap.title', { name: game.name })}
          </DialogTitle>
          <DialogDescription>
            {game.hasMap
              ? t('admin.geo.wandMap.descriptionReplace')
              : t('admin.geo.wandMap.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field
            id="wand-map-url"
            label={t('admin.geo.wandMap.fields.wandUrl')}
            hint={t('admin.geo.wandMap.fields.wandUrlHint')}
            required
          >
            <Input
              id="wand-map-url"
              type="url"
              placeholder="https://wand.com/maps/elden-ring"
              value={form.wandUrl}
              onChange={(e) => set('wandUrl', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field
            id="wand-map-region"
            label={t('admin.geo.wandMap.fields.region')}
            hint={t('admin.geo.wandMap.fields.regionHint')}
          >
            <Input
              id="wand-map-region"
              placeholder={t('admin.geo.wandMap.fields.regionPlaceholder')}
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
              disabled={submitting}
              maxLength={100}
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {game.hasMap
              ? t('admin.geo.wandMap.submitReplace')
              : t('admin.geo.wandMap.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  )
}
