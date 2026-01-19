import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { RewardCalendar } from './RewardCalendar'
import { cn } from '@/lib/utils'
import { Flame, Gift, Sparkles } from 'lucide-react'

export function DailyRewardModal() {
    const { t } = useTranslation()
    const {
        status,
        isModalOpen,
        closeModal,
        claimReward,
        isClaiming,
        justClaimed,
        clearJustClaimed,
    } = useDailyLoginStore()

    const [isAnimating, setIsAnimating] = useState(false)

    if (!status) return null

    const handleClaim = async () => {
        setIsAnimating(true)
        await claimReward()
        // Keep animation a bit longer for effect
        setTimeout(() => setIsAnimating(false), 1000)
    }

    const handleClose = () => {
        closeModal()
        // Clear the just claimed state after a delay to allow exit animation
        setTimeout(clearJustClaimed, 300)
    }

    const reward = justClaimed?.reward || status.todayReward
    const showClaimSuccess = !!justClaimed

    return (
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Gift className="w-5 h-5 text-primary" />
                        {showClaimSuccess
                            ? t('dailyLogin.rewardClaimed')
                            : t('dailyLogin.dailyReward')}
                    </DialogTitle>
                    <DialogDescription>
                        {showClaimSuccess
                            ? t('dailyLogin.claimSuccessDescription')
                            : t('dailyLogin.claimDescription')}
                    </DialogDescription>
                </DialogHeader>

                {/* Streak Display */}
                <div className="flex items-center justify-center gap-2 py-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    <span className="text-lg font-bold">
                        {justClaimed?.newStreak || status.currentStreak} {t('dailyLogin.dayStreak')}
                    </span>
                    {status.currentStreak >= 7 && (
                        <Badge variant="outline" className="bg-orange-500/10 border-orange-500/30 text-orange-400">
                            {t('dailyLogin.onFire')}
                        </Badge>
                    )}
                </div>

                {/* Reward Display */}
                {reward && (
                    <div className={cn(
                        'relative flex flex-col items-center p-6 rounded-lg border border-primary/30 bg-gradient-to-b from-primary/10 to-transparent',
                        isAnimating && 'animate-pulse',
                        showClaimSuccess && 'border-green-500/50 bg-gradient-to-b from-green-500/10 to-transparent'
                    )}>
                        {/* Sparkle effect on claim */}
                        {showClaimSuccess && (
                            <div className="absolute inset-0 pointer-events-none">
                                <Sparkles className="absolute top-2 left-4 w-4 h-4 text-yellow-400 animate-bounce" />
                                <Sparkles className="absolute top-4 right-6 w-3 h-3 text-yellow-400 animate-bounce delay-100" />
                                <Sparkles className="absolute bottom-4 left-8 w-3 h-3 text-yellow-400 animate-bounce delay-200" />
                            </div>
                        )}

                        <span className="text-4xl mb-2">{reward.iconUrl}</span>
                        <h3 className="font-bold text-lg text-center">{reward.displayName}</h3>
                        <p className="text-sm text-muted-foreground text-center mt-1">
                            {reward.description}
                        </p>

                        {/* Reward details */}
                        <div className="flex flex-wrap gap-2 mt-4 justify-center">
                            {reward.rewardValue.items.map((item, idx) => (
                                <Badge key={idx} variant="secondary" className="bg-primary/20">
                                    {item.quantity}x {item.key === 'hint_year' ? t('dailyLogin.hintYear') : t('dailyLogin.hintPublisher')}
                                </Badge>
                            ))}
                            {reward.rewardValue.points > 0 && (
                                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300">
                                    +{reward.rewardValue.points} {t('dailyLogin.points')}
                                </Badge>
                            )}
                        </div>
                    </div>
                )}

                {/* Calendar Progress */}
                <RewardCalendar
                    rewards={status.allRewards}
                    currentDayInCycle={justClaimed?.newDayInCycle || status.currentDayInCycle}
                    hasClaimedToday={showClaimSuccess || status.hasClaimedToday}
                />

                {/* Action Button */}
                <div className="flex justify-center pt-2">
                    {showClaimSuccess ? (
                        <Button onClick={handleClose} variant="gaming">
                            {t('common.close')}
                        </Button>
                    ) : status.canClaim ? (
                        <Button
                            onClick={handleClaim}
                            disabled={isClaiming}
                            variant="gaming"
                            className="min-w-32"
                        >
                            {isClaiming ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin">⏳</span>
                                    {t('dailyLogin.claiming')}
                                </span>
                            ) : (
                                t('dailyLogin.claimReward')
                            )}
                        </Button>
                    ) : (
                        <Button onClick={handleClose} variant="outline">
                            {t('dailyLogin.alreadyClaimed')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
