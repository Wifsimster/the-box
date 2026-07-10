import { useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GeoMapCanvas } from '@/components/geo/GeoMapCanvas'
import { cn } from '@/lib/utils'
import type {
    GeoMap,
    GeoPinSubmission,
    GeoPoint,
    GeoScreenshotCandidate,
    GeoScreenshotMeta,
} from '@the-box/types'

export interface ReviewWorkspaceCandidate {
    candidate: GeoScreenshotCandidate
    pins: GeoPinSubmission[]
    map: GeoMap | null
    meta: GeoScreenshotMeta | null
}

export interface ReviewWorkspaceProps {
    detail: ReviewWorkspaceCandidate | null
    pin: GeoPoint | null
    onPinChange: (point: GeoPoint | null) => void
    saving: boolean
    onPromote: () => void | Promise<void>
    onReject: () => void
    onDemote: () => void
    onCloseDetail: () => void
    prevCandidate: GeoScreenshotCandidate | null
    nextCandidate: GeoScreenshotCandidate | null
    currentIndex: number
    total: number
    onNavigate: (id: number) => void | Promise<void>
}

// Side-by-side review surface: capture on the left, map on the right at xl+,
// stacked below xl. The actions bar is sticky at the bottom of the card so the
// moderator never has to scroll to reach Promote / Reject. Keyboard shortcuts
// (J/K next-prev, A approve, R reject, Esc close) are wired here so they only
// apply while a candidate is open.
export function ReviewWorkspace({
    detail,
    pin,
    onPinChange,
    saving,
    onPromote,
    onReject,
    onDemote,
    onCloseDetail,
    prevCandidate,
    nextCandidate,
    currentIndex,
    total,
    onNavigate,
}: ReviewWorkspaceProps) {
    const { t } = useTranslation()

    useReviewShortcuts({
        enabled: !!detail,
        saving,
        canPromote:
            !!detail &&
            !detail.meta &&
            (!!pin || (detail?.pins.length ?? 0) > 0),
        canReject: !!detail && !detail.meta,
        prevId: prevCandidate?.id ?? null,
        nextId: nextCandidate?.id ?? null,
        onNavigate,
        onPromote,
        onReject,
        onClose: onCloseDetail,
    })

    return (
        <Card className="lg:col-span-2 flex flex-col">
            <CardHeader className="pb-2 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {detail && (
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 shrink-0 lg:hidden"
                                onClick={onCloseDetail}
                                aria-label={t('admin.geo.nav.backToList', 'Retour à la liste')}
                            >
                                <ArrowLeft className="size-4" />
                            </Button>
                        )}
                        <CardTitle className="text-sm truncate">
                            {detail
                                ? `#${detail.candidate.id} · ${t(
                                      'admin.geo.submissionRow.pinCount',
                                      { count: detail.pins.length },
                                  )}`
                                : t('admin.geo.pickSubmission')}
                        </CardTitle>
                    </div>
                    {detail && (
                        <NavControls
                            prev={prevCandidate}
                            next={nextCandidate}
                            currentIndex={currentIndex}
                            total={total}
                            disabled={saving}
                            onNavigate={onNavigate}
                        />
                    )}
                </div>
                {detail && <KeyboardHints />}
            </CardHeader>
            <CardContent
                className="flex-1 space-y-3 p-4 sm:p-6 pt-0 sm:pt-0"
                aria-busy={saving}
            >
                {detail && <AgentPinsNotice pins={detail.pins} />}
                <CompareBody
                    detail={detail}
                    pin={pin}
                    onPinChange={onPinChange}
                />
            </CardContent>
            {detail && detail.map && (
                <ActionBar
                    detail={detail}
                    pin={pin}
                    saving={saving}
                    onPromote={onPromote}
                    onReject={onReject}
                    onDemote={onDemote}
                />
            )}
        </Card>
    )
}

// Surfaces machine-proposed pins (issue #331) to the moderator: which pins came
// from an agent, their source tier, and the required rationale. Agent pins are
// downweighted in consensus and never promote on their own, so this is context
// for the human decision, not an action. Renders nothing when there are none.
function AgentPinsNotice({ pins }: { pins: GeoPinSubmission[] }) {
    const agentPins = pins.filter((p) => p.source && p.source !== 'human')
    if (agentPins.length === 0) return null
    return (
        <div className="rounded-lg border border-neon-pink/40 bg-neon-pink/5 p-3 text-xs space-y-1.5">
            <div className="font-semibold text-neon-pink">
                {agentPins.length} pin{agentPins.length > 1 ? 's' : ''} proposé
                {agentPins.length > 1 ? 's' : ''} par un agent (pondération réduite, jamais
                promu automatiquement)
            </div>
            <ul className="space-y-1">
                {agentPins.map((p) => (
                    <li key={p.id} className="text-muted-foreground">
                        <span className="font-mono">
                            {p.source === 'agent_vision' ? 'vision' : 'structured'}
                            {p.agentModel ? ` · ${p.agentModel}` : ''}
                        </span>
                        {p.agentRationale ? ` — ${p.agentRationale}` : ''}{' '}
                        <span className="opacity-60">
                            ({p.pin.x.toFixed(3)}, {p.pin.y.toFixed(3)}
                            {p.status !== 'pending' ? ` · ${p.status}` : ''})
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

interface CompareBodyProps {
    detail: ReviewWorkspaceCandidate | null
    pin: GeoPoint | null
    onPinChange: (point: GeoPoint | null) => void
}

// Two-pane comparison layout. Both panes share the same max height so they
// line up and the moderator's eyes can flick between them without losing
// context. Stacks below xl so 13" laptops and tablets keep both visible.
function CompareBody({ detail, pin, onPinChange }: CompareBodyProps) {
    const { t } = useTranslation()
    if (!detail || !detail.map) {
        return (
            <p className="text-xs text-muted-foreground">
                {t('admin.geo.detailHintOfficial')}
            </p>
        )
    }
    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            <CapturePane
                imageUrl={detail.candidate.imageUrl}
                candidateId={detail.candidate.id}
            />
            <MapPane
                detail={detail}
                pin={pin}
                onPinChange={onPinChange}
            />
        </div>
    )
}

function CapturePane({
    imageUrl,
    candidateId,
}: {
    imageUrl: string
    candidateId: number
}) {
    const { t } = useTranslation()
    return (
        <figure className="space-y-1.5">
            <figcaption className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                {t('admin.geo.workspace.capture')}
            </figcaption>
            <div className="rounded-lg border bg-black/40 overflow-hidden flex items-center justify-center max-h-[60vh] min-h-[260px]">
                <img
                    src={imageUrl}
                    alt={t('admin.geo.workspace.captureAlt', {
                        id: candidateId,
                    })}
                    className="max-h-[60vh] w-full h-auto object-contain"
                />
            </div>
        </figure>
    )
}

function MapPane({
    detail,
    pin,
    onPinChange,
}: {
    detail: ReviewWorkspaceCandidate
    pin: GeoPoint | null
    onPinChange: (point: GeoPoint | null) => void
}) {
    const { t } = useTranslation()
    if (!detail.map) return null
    return (
        <figure className="space-y-1.5">
            <figcaption className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                {t('admin.geo.workspace.map')}
            </figcaption>
            <div className="rounded-lg border overflow-hidden max-h-[60vh] min-h-[260px]">
                <GeoMapCanvas
                    imageUrl={detail.map.imageUrl}
                    widthPx={detail.map.widthPx}
                    heightPx={detail.map.heightPx}
                    tiles={detail.map.tiles}
                    pin={pin}
                    canonical={
                        detail.meta
                            ? {
                                  x: detail.meta.canonical.x,
                                  y: detail.meta.canonical.y,
                              }
                            : null
                    }
                    onPin={onPinChange}
                    disabled={!!detail.meta}
                />
            </div>
        </figure>
    )
}

interface ActionBarProps {
    detail: ReviewWorkspaceCandidate
    pin: GeoPoint | null
    saving: boolean
    onPromote: () => void | Promise<void>
    onReject: () => void
    onDemote: () => void
}

// Sticky action bar — always visible at the bottom of the card so Promote /
// Reject are one tap away, no scroll required. Background uses card token +
// backdrop-blur so it reads cleanly over either pane.
function ActionBar({
    detail,
    pin,
    saving,
    onPromote,
    onReject,
    onDemote,
}: ActionBarProps) {
    const { t } = useTranslation()
    if (detail.meta) {
        return (
            <div className="sticky bottom-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-3 sm:px-6 rounded-b-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                    <p className="text-xs text-warning">
                        {t('admin.geo.alreadyOfficial')}
                    </p>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={onDemote}
                        disabled={saving}
                        aria-busy={saving}
                        className="w-full sm:w-auto"
                    >
                        <Trash2 className="size-3.5 mr-2" />
                        {t('admin.geo.actions.removeOfficial')}
                    </Button>
                </div>
            </div>
        )
    }
    return (
        <div className="sticky bottom-0 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-3 sm:px-6 rounded-b-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                    {pin
                        ? `(${pin.x.toFixed(3)}, ${pin.y.toFixed(3)})`
                        : t(
                              detail.pins.length === 0
                                  ? 'admin.geo.pickPointRequired'
                                  : 'admin.geo.pickPointForOfficial',
                          )}
                </span>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={onReject}
                        disabled={saving}
                        aria-busy={saving}
                        className="w-full sm:w-auto text-destructive border-destructive/40 hover:bg-destructive/10"
                    >
                        <Trash2 className="size-3.5 mr-2" />
                        {t('admin.geo.actions.decline')}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => void onPromote()}
                        disabled={saving || (!pin && detail.pins.length === 0)}
                        aria-busy={saving}
                        className="gradient-gaming hover:opacity-90 w-full sm:w-auto"
                    >
                        {saving && (
                            <Loader2 className="size-3.5 animate-spin mr-2" />
                        )}
                        {t(
                            pin
                                ? 'admin.geo.actions.makeOfficial'
                                : 'admin.geo.actions.makeOfficialNoPin',
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}

interface NavControlsProps {
    prev: GeoScreenshotCandidate | null
    next: GeoScreenshotCandidate | null
    currentIndex: number
    total: number
    disabled: boolean
    onNavigate: (id: number) => void | Promise<void>
}

function NavControls({
    prev,
    next,
    currentIndex,
    total,
    disabled,
    onNavigate,
}: NavControlsProps) {
    const { t } = useTranslation()
    return (
        <div className="flex items-center gap-1 shrink-0">
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={!prev || disabled}
                onClick={() => prev && void onNavigate(prev.id)}
                aria-label={t('admin.geo.nav.previous')}
                title={t('admin.geo.nav.previous')}
            >
                <ChevronLeft className="size-4" aria-hidden />
            </Button>
            {currentIndex >= 0 && total > 0 && (
                <span
                    className="text-[10px] tabular-nums text-muted-foreground min-w-[2.5rem] text-center"
                    aria-live="polite"
                >
                    {t('admin.geo.nav.position', {
                        current: currentIndex + 1,
                        total,
                    })}
                </span>
            )}
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                disabled={!next || disabled}
                onClick={() => next && void onNavigate(next.id)}
                aria-label={t('admin.geo.nav.next')}
                title={t('admin.geo.nav.next')}
            >
                <ChevronRight className="size-4" aria-hidden />
            </Button>
        </div>
    )
}

function KeyboardHints() {
    const { t } = useTranslation()
    return (
        <p className="hidden lg:flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground mt-1">
            <KeyHint k="J" label={t('admin.geo.keyboard.next')} />
            <KeyHint k="K" label={t('admin.geo.keyboard.previous')} />
            <KeyHint k="A" label={t('admin.geo.keyboard.approve')} />
            <KeyHint k="R" label={t('admin.geo.keyboard.reject')} />
            <KeyHint k="Esc" label={t('admin.geo.keyboard.close')} />
        </p>
    )
}

function KeyHint({ k, label }: { k: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <kbd
                className={cn(
                    'inline-flex h-4 min-w-4 px-1 items-center justify-center rounded',
                    'border border-border/60 bg-muted/40 font-mono text-[10px]',
                    'text-foreground',
                )}
            >
                {k}
            </kbd>
            <span>{label}</span>
        </span>
    )
}

interface ReviewShortcutsArgs {
    enabled: boolean
    saving: boolean
    canPromote: boolean
    canReject: boolean
    prevId: number | null
    nextId: number | null
    onNavigate: (id: number) => void | Promise<void>
    onPromote: () => void | Promise<void>
    onReject: () => void
    onClose: () => void
}

// Window-level keyboard shortcuts for the review surface. Guards against:
//  - typing inside an input/textarea/contenteditable (so Dialog text fields
//    don't trigger Promote when the moderator types "a"),
//  - any modifier key (so Cmd+R reload still works),
//  - acting on a candidate while a save request is in flight.
// All handlers reference the latest props via a ref so we don't tear down
// the listener on every render.
function useReviewShortcuts(args: ReviewShortcutsArgs) {
    // Latest-props ref pattern via useLayoutEffect (the project's
    // `react-hooks/refs` rule forbids writing to ref.current during render).
    // Runs synchronously before paint, so the keydown handler always reads
    // fresh args without tearing down the listener.
    const ref = useRef(args)
    useLayoutEffect(() => {
        ref.current = args
    })

    useEffect(() => {
        if (!args.enabled) return
        const handler = (event: KeyboardEvent) => {
            // Cooperate with Radix DismissableLayer (Reject / Demote dialogs):
            // its Escape listener runs on document before this window listener
            // and sets defaultPrevented. Without this guard, pressing Escape
            // inside a dialog would close both the dialog and the workspace.
            if (event.defaultPrevented) return
            if (
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                event.shiftKey
            ) {
                return
            }
            const target = event.target as HTMLElement | null
            if (target) {
                const tag = target.tagName
                if (
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    target.isContentEditable
                ) {
                    return
                }
            }
            const current = ref.current
            if (current.saving && event.key !== 'Escape') return

            switch (event.key) {
                case 'j':
                case 'J':
                case 'ArrowDown':
                    if (current.nextId !== null) {
                        event.preventDefault()
                        void current.onNavigate(current.nextId)
                    }
                    return
                case 'k':
                case 'K':
                case 'ArrowUp':
                    if (current.prevId !== null) {
                        event.preventDefault()
                        void current.onNavigate(current.prevId)
                    }
                    return
                case 'a':
                case 'A':
                    if (current.canPromote) {
                        event.preventDefault()
                        void current.onPromote()
                    }
                    return
                case 'r':
                case 'R':
                    if (current.canReject) {
                        event.preventDefault()
                        current.onReject()
                    }
                    return
                case 'Escape':
                    event.preventDefault()
                    current.onClose()
                    return
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [args.enabled])
}
