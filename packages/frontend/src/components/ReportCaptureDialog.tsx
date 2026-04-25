import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Loader2 } from 'lucide-react'
import type { ScreenshotReportReason } from '@the-box/types'
import { reportsApi, ReportApiError, type SubmitReportInput } from '@/lib/api/reports'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
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

export function ReportCaptureDialog({
    target,
    isAuthenticated,
    triggerClassName,
    iconOnly = false,
}: ReportCaptureDialogProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [reason, setReason] = useState<ScreenshotReportReason>('wrong_game')
    const [details, setDetails] = useState('')

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setReason('wrong_game')
            setDetails('')
            setSubmitted(false)
        }
        setOpen(next)
    }

    const handleSubmit = async () => {
        if (!isAuthenticated) {
            toast.error(t('report.loginRequired'))
            return
        }
        setSubmitting(true)
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
            setSubmitted(true)
            setOpen(false)
        } catch (err) {
            const message =
                err instanceof ReportApiError
                    ? err.message
                    : t('report.errorGeneric')
            toast.error(message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
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
                    <Flag className={iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5 mr-1.5'} />
                    {!iconOnly && t('report.trigger')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('report.title')}</DialogTitle>
                    <DialogDescription>
                        {t('report.description')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="report-reason">
                            {t('report.reasonLabel')}
                        </Label>
                        <Select
                            value={reason}
                            onValueChange={(v) =>
                                setReason(v as ScreenshotReportReason)
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
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            maxLength={500}
                            rows={3}
                            placeholder={t('report.detailsPlaceholder')}
                            className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                        />
                    </div>
                </div>
                <DialogFooter>
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
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        )}
                        {submitting ? t('report.submitting') : t('report.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
