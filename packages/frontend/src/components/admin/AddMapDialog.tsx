import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ExternalLink, Loader2, Search, Sparkles, Upload } from 'lucide-react'

// Single dialog for the three "Add map for game" strategies. Each entry
// point in the side panel opens this dialog at its preferred tab; the
// operator can switch strategies without closing.

export type AddMapStrategy = 'research' | 'wand' | 'manual'

interface AddMapDialogProps {
    isOpen: boolean
    onClose: () => void
    game: { id: number; name: string; slug: string; hasMap: boolean } | null
    // Strategy is fully controlled by the parent so opening the dialog from
    // the three side-panel buttons lands on the matching tab without any
    // reset-on-open effect inside the dialog. The "Paste URL" CTA inside
    // the Research pane also bubbles up via this setter.
    strategy: AddMapStrategy
    onStrategyChange: (s: AddMapStrategy) => void
    onSuccess: () => void
}

export function AddMapDialog({
    isOpen,
    onClose,
    game,
    strategy,
    onStrategyChange,
    onSuccess,
}: AddMapDialogProps) {
    const { t } = useTranslation()

    if (!game) return null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-sm sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="size-4 text-neon-pink" aria-hidden />
                        {t('admin.geo.addMap.title', { name: game.name })}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {game.hasMap
                            ? t('admin.geo.addMap.descriptionReplace')
                            : t('admin.geo.addMap.description')}
                    </DialogDescription>
                </DialogHeader>

                <Tabs
                    value={strategy}
                    onValueChange={(v) => onStrategyChange(v as AddMapStrategy)}
                    className="space-y-3"
                >
                    <TabsList className="w-full">
                        <TabsTrigger value="research" className="gap-1.5 flex-1">
                            <Search className="size-3.5" />
                            {t('admin.geo.addMap.tabs.research')}
                        </TabsTrigger>
                        <TabsTrigger value="wand" className="gap-1.5 flex-1">
                            <Sparkles className="size-3.5" />
                            {t('admin.geo.addMap.tabs.wand')}
                        </TabsTrigger>
                        <TabsTrigger value="manual" className="gap-1.5 flex-1">
                            <Upload className="size-3.5" />
                            {t('admin.geo.addMap.tabs.manual')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="research" className="space-y-3 pt-1">
                        <ResearchPane
                            game={game}
                            onSwitchToManual={() => onStrategyChange('manual')}
                            onClose={onClose}
                        />
                    </TabsContent>

                    <TabsContent value="wand" className="space-y-3 pt-1">
                        <WandPane
                            key={game.id}
                            game={game}
                            onSuccess={onSuccess}
                            onClose={onClose}
                        />
                    </TabsContent>

                    <TabsContent value="manual" className="space-y-3 pt-1">
                        <ManualPane
                            key={game.id}
                            game={game}
                            onSuccess={onSuccess}
                            onClose={onClose}
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

interface ResearchSource {
    key: string
    label: string
    description: string
    url: (gameName: string, slug: string) => string
}

const RESEARCH_SOURCES: ResearchSource[] = [
    {
        key: 'google',
        label: 'Google Images',
        description: 'Broad image search — fastest path to "is there ANY map".',
        url: (name) =>
            `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${name} world map`)}`,
    },
    {
        key: 'strategywiki',
        label: 'StrategyWiki',
        description: 'CC-BY-SA wiki with structured /Maps subpages.',
        url: (name) =>
            `https://strategywiki.org/w/index.php?search=${encodeURIComponent(name)}`,
    },
    {
        key: 'fextralife',
        label: 'Fextralife wiki',
        description: 'Best signal for Soulsborne / RPG / open-world titles.',
        url: (_name, slug) => {
            const compact = slug.replace(/[^a-z0-9]+/gi, '').toLowerCase()
            return compact
                ? `https://${compact}.wiki.fextralife.com/Interactive+Map`
                : 'https://fextralife.com/wikis/'
        },
    },
    {
        key: 'mapgenie',
        label: 'Map Genie',
        description: 'High-quality Leaflet maps; check the og:image preview.',
        url: (_name, slug) => `https://mapgenie.io/${slug}`,
    },
    {
        key: 'commons',
        label: 'Wikimedia Commons',
        description: 'License-clean maps; filter by Category:Maps_of_<Game>.',
        url: (name) =>
            `https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(`Map of ${name}`)}&title=Special:MediaSearch&go=Go&type=image`,
    },
    {
        key: 'reddit',
        label: 'Reddit',
        description: 'Fan-uploaded HD maps; image posts only.',
        url: (name) =>
            `https://www.reddit.com/search/?q=${encodeURIComponent(`${name} world map`)}&type=link&sort=top&t=all`,
    },
]

function ResearchPane({
    game,
    onSwitchToManual,
    onClose,
}: {
    game: { name: string; slug: string }
    onSwitchToManual: () => void
    onClose: () => void
}) {
    const { t } = useTranslation()
    return (
        <>
            <p className="text-xs text-muted-foreground">
                {t('admin.geo.research.description')}
            </p>
            <ul className="space-y-1.5">
                {RESEARCH_SOURCES.map((s) => (
                    <li key={s.key}>
                        <a
                            href={s.url(game.name, game.slug)}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="group flex items-start gap-2 rounded-md border border-border/40 bg-muted/10 p-2.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                            <ExternalLink
                                className="mt-0.5 size-3.5 text-muted-foreground group-hover:text-primary"
                                aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium">{s.label}</p>
                                <p className="text-[11px] text-muted-foreground">
                                    {s.description}
                                </p>
                            </div>
                        </a>
                    </li>
                ))}
            </ul>
            <DialogFooter className="flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row">
                <Button
                    size="sm"
                    variant="default"
                    className="flex-1"
                    onClick={onSwitchToManual}
                >
                    {t('admin.geo.research.pasteUrlCta')}
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={onClose}>
                    {t('admin.geo.research.close')}
                </Button>
            </DialogFooter>
        </>
    )
}

interface WandFormState {
    wandUrl: string
    region: string
}

function defaultWandForm(slug: string): WandFormState {
    return {
        wandUrl: slug ? `https://wand.com/maps/${encodeURIComponent(slug)}` : '',
        region: '',
    }
}

function WandPane({
    game,
    onSuccess,
    onClose,
}: {
    game: { id: number; name: string; slug: string; hasMap: boolean }
    onSuccess: () => void
    onClose: () => void
}) {
    const { t } = useTranslation()
    // The parent keys this pane on game.id, so React remounts (with fresh
    // state) whenever the operator switches to a different game — no
    // reset-on-prop-change effect needed.
    const [form, setForm] = useState<WandFormState>(() => defaultWandForm(game.slug))
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const set = <K extends keyof WandFormState>(key: K, value: WandFormState[K]) =>
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
        <>
            <p className="text-xs text-muted-foreground">
                {game.hasMap
                    ? t('admin.geo.wandMap.descriptionReplace')
                    : t('admin.geo.wandMap.description')}
            </p>
            <Field
                id="add-map-wand-url"
                label={t('admin.geo.wandMap.fields.wandUrl')}
                hint={t('admin.geo.wandMap.fields.wandUrlHint')}
                required
            >
                <Input
                    id="add-map-wand-url"
                    type="url"
                    placeholder="https://wand.com/maps/elden-ring"
                    value={form.wandUrl}
                    onChange={(e) => set('wandUrl', e.target.value)}
                    disabled={submitting}
                />
            </Field>

            <Field
                id="add-map-wand-region"
                label={t('admin.geo.wandMap.fields.region')}
                hint={t('admin.geo.wandMap.fields.regionHint')}
            >
                <Input
                    id="add-map-wand-region"
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

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 border-t border-border/40 pt-3">
                <Button variant="outline" onClick={onClose} disabled={submitting}>
                    {t('common.cancel')}
                </Button>
                <Button onClick={() => void submit()} disabled={submitting}>
                    {submitting && <Loader2 className="size-4 animate-spin mr-1.5" />}
                    {game.hasMap
                        ? t('admin.geo.wandMap.submitReplace')
                        : t('admin.geo.wandMap.submit')}
                </Button>
            </DialogFooter>
        </>
    )
}

interface ManualFormState {
    imageUrl: string
    widthPx: string
    heightPx: string
    license: string
    attribution: string
    sourceUrl: string
    region: string
}

const EMPTY_MANUAL: ManualFormState = {
    imageUrl: '',
    widthPx: '',
    heightPx: '',
    license: '',
    attribution: '',
    sourceUrl: '',
    region: '',
}

function ManualPane({
    game,
    onSuccess,
    onClose,
}: {
    game: { id: number; name: string; hasMap: boolean }
    onSuccess: () => void
    onClose: () => void
}) {
    const { t } = useTranslation()
    // Keyed on game.id by the parent, so switching games remounts this pane
    // with fresh state (see WandPane).
    const [form, setForm] = useState<ManualFormState>(EMPTY_MANUAL)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const set = <K extends keyof ManualFormState>(key: K, value: ManualFormState[K]) =>
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
        <>
            <p className="text-xs text-muted-foreground">
                {game.hasMap
                    ? t('admin.geo.manualMap.descriptionReplace')
                    : t('admin.geo.manualMap.description')}
            </p>

            <Field
                id="add-map-manual-image-url"
                label={t('admin.geo.manualMap.fields.imageUrl')}
                required
            >
                <Input
                    id="add-map-manual-image-url"
                    type="url"
                    placeholder="https://..."
                    value={form.imageUrl}
                    onChange={(e) => set('imageUrl', e.target.value)}
                    disabled={submitting}
                />
            </Field>

            <div className="grid grid-cols-2 gap-3">
                <Field
                    id="add-map-manual-width"
                    label={t('admin.geo.manualMap.fields.widthPx')}
                    required
                >
                    <Input
                        id="add-map-manual-width"
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
                    id="add-map-manual-height"
                    label={t('admin.geo.manualMap.fields.heightPx')}
                    required
                >
                    <Input
                        id="add-map-manual-height"
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
                id="add-map-manual-license"
                label={t('admin.geo.manualMap.fields.license')}
                required
            >
                <Input
                    id="add-map-manual-license"
                    placeholder="CC-BY-SA-3.0, MIT, Publisher press kit, ..."
                    value={form.license}
                    onChange={(e) => set('license', e.target.value)}
                    disabled={submitting}
                />
            </Field>

            <Field
                id="add-map-manual-attribution"
                label={t('admin.geo.manualMap.fields.attribution')}
            >
                <Input
                    id="add-map-manual-attribution"
                    value={form.attribution}
                    onChange={(e) => set('attribution', e.target.value)}
                    disabled={submitting}
                />
            </Field>

            <Field
                id="add-map-manual-source-url"
                label={t('admin.geo.manualMap.fields.sourceUrl')}
            >
                <Input
                    id="add-map-manual-source-url"
                    type="url"
                    placeholder="https://..."
                    value={form.sourceUrl}
                    onChange={(e) => set('sourceUrl', e.target.value)}
                    disabled={submitting}
                />
            </Field>

            <Field
                id="add-map-manual-region"
                label={t('admin.geo.manualMap.fields.region')}
                hint={t('admin.geo.manualMap.fields.regionHint')}
            >
                <Input
                    id="add-map-manual-region"
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

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 border-t border-border/40 pt-3">
                <Button variant="outline" onClick={onClose} disabled={submitting}>
                    {t('common.cancel')}
                </Button>
                <Button onClick={() => void submit()} disabled={submitting}>
                    {submitting && <Loader2 className="size-4 animate-spin mr-1.5" />}
                    {game.hasMap
                        ? t('admin.geo.manualMap.submitReplace')
                        : t('admin.geo.manualMap.submit')}
                </Button>
            </DialogFooter>
        </>
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
