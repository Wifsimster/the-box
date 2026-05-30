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
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-sm sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="size-5 text-destructive" />
                        {t('admin.geo.reset.dialog.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('admin.geo.reset.dialog.body')}
                    </DialogDescription>
                </DialogHeader>

                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                    <li>{t('admin.geo.reset.dialog.bullets.importStates')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.ingestFailures')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.maps')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.challenges')}</li>
                    <li>{t('admin.geo.reset.dialog.bullets.metadata')}</li>
                </ul>

                <div className="space-y-2">
                    <Label htmlFor="reset-confirm-input" className="text-xs">
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
                    />
                </div>

                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
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
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
