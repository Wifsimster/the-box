import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Loader2 } from 'lucide-react'
import type { ScreenshotReportReason } from '@the-box/types'

const REPORT_REASONS = [
    'wrong_game',
    'low_quality',
    'not_recognizable',
    'inappropriate',
    'other',
] as const satisfies readonly ScreenshotReportReason[]
import { geoApi, GeoApiError } from '@/lib/api/geo'
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

interface ReportCaptureDialogProps {
    geoScreenshotCandidateId: number
    isAuthenticated: boolean
}

export function ReportCaptureDialog({
    geoScreenshotCandidateId,
    isAuthenticated,
}: ReportCaptureDialogProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [reason, setReason] = useState<ScreenshotReportReason>('wrong_game')
    const [details, setDetails] = useState('')

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            // Reset on close so re-opening starts fresh.
            setReason('wrong_game')
            setDetails('')
            setSubmitted(false)
        }
        setOpen(next)
    }

    const handleSubmit = async () => {
        if (!isAuthenticated) {
            toast.error(t('geo.daily.report.loginRequired'))
            return
        }
        setSubmitting(true)
        try {
            const result = await geoApi.reportCapture({
                geoScreenshotCandidateId,
                reason,
                details: details.trim() ? details.trim() : undefined,
            })
            toast.success(
                result.deactivated
                    ? t('geo.daily.report.successDeactivated')
                    : t('geo.daily.report.successReceived'),
            )
            setSubmitted(true)
            setOpen(false)
        } catch (err) {
            const message =
                err instanceof GeoApiError
                    ? err.message
                    : t('geo.daily.report.errorGeneric')
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
                    className="text-xs text-muted-foreground hover:text-destructive"
                >
                    <Flag className="h-3.5 w-3.5 mr-1.5" />
                    {t('geo.daily.report.trigger')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('geo.daily.report.title')}</DialogTitle>
                    <DialogDescription>
                        {t('geo.daily.report.description')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="report-reason">
                            {t('geo.daily.report.reasonLabel')}
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
                                        {t(`geo.daily.report.reasons.${r}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="report-details">
                            {t('geo.daily.report.detailsLabel')}
                        </Label>
                        <textarea
                            id="report-details"
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            maxLength={500}
                            rows={3}
                            placeholder={t('geo.daily.report.detailsPlaceholder')}
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
                        {submitting
                            ? t('geo.daily.report.submitting')
                            : t('geo.daily.report.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
