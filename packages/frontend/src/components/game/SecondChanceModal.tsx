import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useGameStore } from '@/stores/gameStore'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { gameApi } from '@/lib/api/game'
import { toast } from '@/lib/toast'

/**
 * Reactive modal that asks the player whether to spend a `second_chance`
 * powerup after a wrong guess. Triggered by `useGameGuess` (writes to
 * `gameStore.secondChancePrompt`); dismissal does NOT consume the
 * powerup. On accept, the backend decrements inventory and records the
 * activation atomically — the next correct guess on this position then
 * earns at least 70 points (a FLOOR, not a cap; see backend
 * game.service for the contract).
 */
export function SecondChanceModal() {
    const { t } = useTranslation()
    const prompt = useGameStore((s) => s.secondChancePrompt)
    const tierSessionId = useGameStore((s) => s.tierSessionId)
    const dismiss = useGameStore((s) => s.dismissSecondChancePrompt)
    const markActivated = useGameStore((s) => s.markSecondChanceActivated)
    const fetchInventory = useDailyLoginStore((s) => s.fetchInventory)

    const [submitting, setSubmitting] = useState(false)

    const open = prompt !== null
    const position = prompt?.position ?? null

    const handleAccept = async () => {
        if (!tierSessionId || position === null) return
        setSubmitting(true)
        try {
            await gameApi.activateSecondChance({ tierSessionId, position })
            markActivated(position)
            // Refresh inventory so the bell counter and any other
            // surface that reads `powerups.second_chance` updates.
            void fetchInventory()
        } catch {
            toast.error(t('game.secondChance.activationFailed'))
            dismiss()
        } finally {
            setSubmitting(false)
        }
    }

    const handleDismiss = () => {
        if (submitting) return
        dismiss()
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Heart className="h-5 w-5 text-neon-pink" />
                        {t('game.secondChance.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('game.secondChance.description')}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        variant="outline"
                        onClick={handleDismiss}
                        disabled={submitting}
                    >
                        {t('game.secondChance.dismiss')}
                    </Button>
                    <Button
                        variant="gaming"
                        onClick={handleAccept}
                        disabled={submitting}
                    >
                        {submitting
                            ? t('game.secondChance.activating')
                            : t('game.secondChance.accept')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
