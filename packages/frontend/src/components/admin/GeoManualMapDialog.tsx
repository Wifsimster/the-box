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

// Tier 4 in the geo_map ingestion cascade: when no curated registry entry,
// Fandom Interactive Map, or Wikidata P242 image is available for a game,
// an admin can paste in a stable image URL with declared license and
// attribution. The backend route (`POST /api/admin/geo/maps/manual`) does
// no image processing — the admin is responsible for hosting the asset.

interface GeoManualMapDialogProps {
  isOpen: boolean
  onClose: () => void
  game: { id: number; name: string; hasMap: boolean } | null
  onSuccess: () => void
}

interface FormState {
  imageUrl: string
  widthPx: string
  heightPx: string
  license: string
  attribution: string
  sourceUrl: string
  region: string
}

const EMPTY: FormState = {
  imageUrl: '',
  widthPx: '',
  heightPx: '',
  license: '',
  attribution: '',
  sourceUrl: '',
  region: '',
}

export function GeoManualMapDialog({
  isOpen,
  onClose,
  game,
  onSuccess,
}: GeoManualMapDialogProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset every time the dialog opens for a fresh game so previously-typed
  // values don't leak across sessions.
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY)
      setError(null)
    }
  }, [isOpen, game?.id])

  if (!game) return null

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = async () => {
    if (submitting) return
    setError(null)
    const widthPx = Number(form.widthPx)
    const heightPx = Number(form.heightPx)
    if (
      !form.imageUrl ||
      !form.license ||
      !Number.isFinite(widthPx) ||
      widthPx <= 0 ||
      !Number.isFinite(heightPx) ||
      heightPx <= 0
    ) {
      setError(t('admin.geo.manualMap.errors.required'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/geo/maps/manual', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: game.id,
          imageUrl: form.imageUrl,
          widthPx,
          heightPx,
          license: form.license,
          attribution: form.attribution || undefined,
          sourceUrl: form.sourceUrl || undefined,
          region: form.region.trim() || undefined,
          // If a map already exists, the operator is explicitly overwriting
          // it; otherwise the backend would 409 on duplicate.
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
            {t('admin.geo.manualMap.title', { name: game.name })}
          </DialogTitle>
          <DialogDescription>
            {game.hasMap
              ? t('admin.geo.manualMap.descriptionReplace')
              : t('admin.geo.manualMap.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field
            id="manual-map-image-url"
            label={t('admin.geo.manualMap.fields.imageUrl')}
            required
          >
            <Input
              id="manual-map-image-url"
              type="url"
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="manual-map-width"
              label={t('admin.geo.manualMap.fields.widthPx')}
              required
            >
              <Input
                id="manual-map-width"
                type="number"
                inputMode="numeric"
                min={1}
                max={32768}
                value={form.widthPx}
                onChange={(e) => set('widthPx', e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field
              id="manual-map-height"
              label={t('admin.geo.manualMap.fields.heightPx')}
              required
            >
              <Input
                id="manual-map-height"
                type="number"
                inputMode="numeric"
                min={1}
                max={32768}
                value={form.heightPx}
                onChange={(e) => set('heightPx', e.target.value)}
                disabled={submitting}
              />
            </Field>
          </div>

          <Field
            id="manual-map-license"
            label={t('admin.geo.manualMap.fields.license')}
            required
          >
            <Input
              id="manual-map-license"
              placeholder="CC-BY-SA-3.0, MIT, Publisher press kit, ..."
              value={form.license}
              onChange={(e) => set('license', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field
            id="manual-map-attribution"
            label={t('admin.geo.manualMap.fields.attribution')}
          >
            <Input
              id="manual-map-attribution"
              value={form.attribution}
              onChange={(e) => set('attribution', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field
            id="manual-map-source-url"
            label={t('admin.geo.manualMap.fields.sourceUrl')}
          >
            <Input
              id="manual-map-source-url"
              type="url"
              placeholder="https://..."
              value={form.sourceUrl}
              onChange={(e) => set('sourceUrl', e.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field
            id="manual-map-region"
            label={t('admin.geo.manualMap.fields.region')}
            hint={t('admin.geo.manualMap.fields.regionHint')}
          >
            <Input
              id="manual-map-region"
              placeholder={t('admin.geo.manualMap.fields.regionPlaceholder')}
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
              ? t('admin.geo.manualMap.submitReplace')
              : t('admin.geo.manualMap.submit')}
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
