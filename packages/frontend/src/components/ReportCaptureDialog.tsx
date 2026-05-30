import { useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Loader2 } from 'lucide-react'
import type { ScreenshotReportReason } from '@the-box/types'
import { reportsApi, ReportApiError, type SubmitReportInput } from '@/lib/api/reports'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
    ResponsiveDialog,
    ResponsiveDialogContent,
    ResponsiveDialogDescription,
    ResponsiveDialogFooter,
    ResponsiveDialogHeader,
    ResponsiveDialogTitle,
    ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const REPORT_REASONS = [
    'wrong_game',
    'low_quality',
    'not_recognizable',
    'inappropriate',
    'too_easy',
    'other',
] as const satisfies readonly ScreenshotReportReason[]

// Polymorphic target: callers pass exactly one of `screenshotId` (main daily
// game / catch-up) or `geoScreenshotCandidateId` (geo pin game). The dialog
// is otherwise identical regardless of where it's hosted.
export type ReportCaptureTarget =
    | { screenshotId: number; geoScreenshotCandidateId?: never }
    | { geoScreenshotCandidateId: number; screenshotId?: never }

interface ReportCaptureDialogProps {
    target: ReportCaptureTarget
    isAuthenticated: boolean
    // Optional — when supplied lets the dialog render a custom trigger
    // (e.g. an icon-only button overlaid on the screenshot viewer).
    triggerClassName?: string
    iconOnly?: boolean
}

interface ReportFormState {
    open: boolean
    submitting: boolean
    submitted: boolean
    reason: ScreenshotReportReason
    details: string
}

type ReportFormAction =
    | { type: 'openChanged'; open: boolean }
    | { type: 'reasonChanged'; reason: ScreenshotReportReason }
    | { type: 'detailsChanged'; details: string }
    | { type: 'submitStarted' }
    | { type: 'submitSucceeded' }
    | { type: 'submitFailed' }

const initialReportFormState: ReportFormState = {
    open: false,
    submitting: false,
    submitted: false,
    reason: 'wrong_game',
    details: '',
}

function reportFormReducer(
    state: ReportFormState,
    action: ReportFormAction,
): ReportFormState {
    switch (action.type) {
        case 'openChanged':
            return action.open
                ? { ...state, open: true }
                : {
                      ...state,
                      open: false,
                      reason: 'wrong_game',
                      details: '',
                      submitted: false,
                  }
        case 'reasonChanged':
            return { ...state, reason: action.reason }
        case 'detailsChanged':
            return { ...state, details: action.details }
        case 'submitStarted':
            return { ...state, submitting: true }
        case 'submitSucceeded':
            return { ...state, submitting: false, submitted: true, open: false }
        case 'submitFailed':
            return { ...state, submitting: false }
        default:
            return state
    }
}

export function ReportCaptureDialog({
    target,
    isAuthenticated,
    triggerClassName,
    iconOnly = false,
}: ReportCaptureDialogProps) {
    const { t } = useTranslation()
    const [state, dispatch] = useReducer(
        reportFormReducer,
        initialReportFormState,
    )
    const { open, submitting, submitted, reason, details } = state

    const handleOpenChange = (next: boolean) => {
        dispatch({ type: 'openChanged', open: next })
    }

    const handleSubmit = async () => {
        if (!isAuthenticated) {
            toast.error(t('report.loginRequired'))
            return
        }
        dispatch({ type: 'submitStarted' })
        try {
            const payload: SubmitReportInput =
                'screenshotId' in target && target.screenshotId !== undefined
                    ? {
                          screenshotId: target.screenshotId,
                          reason,
                          details: details.trim() || undefined,
                      }
                    : {
                          geoScreenshotCandidateId:
                              target.geoScreenshotCandidateId!,
                          reason,
                          details: details.trim() || undefined,
                      }
            const result = await reportsApi.submit(payload)
            toast.success(
                result.deactivated
                    ? t('report.successDeactivated')
                    : t('report.successReceived'),
            )
            dispatch({ type: 'submitSucceeded' })
        } catch (err) {
            const message =
                err instanceof ReportApiError
                    ? err.message
                    : t('report.errorGeneric')
            toast.error(message)
            dispatch({ type: 'submitFailed' })
        }
    }

    return (
        <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
            <ResponsiveDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={submitted}
                    title={t('report.trigger')}
                    aria-label={t('report.trigger')}
                    className={
                        triggerClassName ??
                        'text-xs text-muted-foreground hover:text-destructive'
                    }
                >
                    <Flag className={iconOnly ? 'size-4' : 'size-3.5 mr-1.5'} />
                    {!iconOnly && t('report.trigger')}
                </Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent className="sm:max-w-md">
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle>{t('report.title')}</ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        {t('report.description')}
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="report-reason">
                            {t('report.reasonLabel')}
                        </Label>
                        <Select
                            value={reason}
                            onValueChange={(v) =>
                                dispatch({
                                    type: 'reasonChanged',
                                    reason: v as ScreenshotReportReason,
                                })
                            }
                        >
                            <SelectTrigger id="report-reason">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {REPORT_REASONS.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {t(`report.reasons.${r}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="report-details">
                            {t('report.detailsLabel')}
                        </Label>
                        <textarea
                            id="report-details"
                            aria-label={t('report.detailsLabel')}
                            value={details}
                            onChange={(e) =>
                                dispatch({
                                    type: 'detailsChanged',
                                    details: e.target.value,
                                })
                            }
                            maxLength={500}
                            rows={3}
                            placeholder={t('report.detailsPlaceholder')}
                            className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                        />
                    </div>
                </div>
                <ResponsiveDialogFooter>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleOpenChange(false)}
                        disabled={submitting}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !isAuthenticated}
                        className="gradient-gaming hover:opacity-90"
                    >
                        {submitting && (
                            <Loader2 className="size-4 animate-spin mr-2" />
                        )}
                        {submitting ? t('report.submitting') : t('report.submit')}
                    </Button>
                </ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    )
}
