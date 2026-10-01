import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ResponsiveDialog,
    ResponsiveDialogContent,
    ResponsiveDialogDescription,
    ResponsiveDialogFooter,
    ResponsiveDialogHeader,
    ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface ResetScrapingDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => Promise<void> | void
    isLoading?: boolean
}

// Fallback if the locale ever ships without a confirmWord — keeps the
// dialog usable instead of letting any input pass.
const DEFAULT_CONFIRM_WORD = 'RESET'

export function ResetScrapingDialog({
    isOpen,
    onClose,
    onConfirm,
    isLoading = false,
}: ResetScrapingDialogProps) {
    const { t } = useTranslation()
    // Localized — French operators type RÉINITIALISER, English RESET.
    // Compared case-insensitively + trim()'d so accent-keyboard quirks
    // don't trap an operator who clearly understood the intent.
    const confirmWord = t('admin.geo.reset.dialog.confirmWord', DEFAULT_CONFIRM_WORD)
    const [typed, setTyped] = useState('')

    const handleClose = () => {
        if (isLoading) return
        setTyped('')
        onClose()
    }

    const canConfirm =
        typed.trim().toLocaleUpperCase() === confirmWord.toLocaleUpperCase() &&
        !isLoading

    return (
        <ResponsiveDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <ResponsiveDialogContent className="sm:max-w-md">
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle className="flex items-center justify-center gap-2 sm:justify-start">
                        <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
                        {t('admin.geo.reset.dialog.title')}
                    </ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        {t('admin.geo.reset.dialog.body')}
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>

                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    <li>{t('admin.geo.reset.dialog.bullets.importStates')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.ingestFailures')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.maps')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.challenges')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.metadata')}</li>
                </ul>

                <div className="space-y-2">
                    <Label htmlFor="reset-confirm-input">
                        {t('admin.geo.reset.dialog.confirmLabel', { word: confirmWord })}
                    </Label>
                    <Input
                        id="reset-confirm-input"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder={confirmWord}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && canConfirm) void onConfirm()
                        }}
                    />
                </div>

                <ResponsiveDialogFooter>
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        disabled={isLoading}
                        className="w-full sm:w-auto"
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => void onConfirm()}
                        disabled={!canConfirm}
                        className="w-full sm:w-auto"
                    >
                        {isLoading && <Loader2 className="size-4 animate-spin" />}
                        {t('admin.geo.reset.dialog.confirm')}
                    </Button>
                </ResponsiveDialogFooter>
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    )
}
