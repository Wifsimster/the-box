import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ResponsiveDialog,
    ResponsiveDialogContent,
    ResponsiveDialogHeader,
    ResponsiveDialogTitle,
    ResponsiveDialogDescription,
} from '@/components/ui/responsive-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { RewardCalendar } from './RewardCalendar'
import { cn } from '@/lib/utils'
import { Flame, Gift, Sparkles } from 'lucide-react'

// i18n key per item_key. New keys (hint_developer, hint_genre,
// streak_freeze, second_chance) fall back to the raw item_key so
// a missing translation does not break the modal.
const REWARD_ITEM_I18N_KEY: Record<string, string> = {
    hint_year: 'dailyLogin.hintYear',
    hint_publisher: 'dailyLogin.hintPublisher',
    hint_developer: 'dailyLogin.hintDeveloper',
    hint_genre: 'dailyLogin.hintGenre',
    streak_freeze: 'dailyLogin.streakFreeze',
    second_chance: 'dailyLogin.secondChance',
}

function RewardItemBadgeLabel({ item }: { item: { key: string; quantity: number } }) {
    const { t } = useTranslation()
    const label = t(REWARD_ITEM_I18N_KEY[item.key] ?? '', {
        defaultValue: item.key,
    })
    return (
        <Badge variant="secondary" className="bg-primary/20">
            {`${item.quantity}× ${label}`}
        </Badge>
    )
}

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
        // Brief delay to show success feedback, then auto-close
        setTimeout(() => {
            setIsAnimating(false)
            handleClose()
        }, 800)
    }

    // Closing the modal while a reward is still claimable would otherwise
    // strand the player on a "you forgot to click Récupérer" path. Fire
    // the claim and let the store update; the badge in the header reflects
    // the result. We don't await — a closed dialog shouldn't block on IO.
    const handleClose = () => {
        if (status.canClaim && !isClaiming && !justClaimed) {
            void claimReward()
        }
        closeModal()
        // Clear the just claimed state after a delay to allow exit animation
        setTimeout(clearJustClaimed, 300)
    }

    const reward = justClaimed?.reward || status.todayReward
    const showClaimSuccess = !!justClaimed

    return (
        <ResponsiveDialog open={isModalOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
            <ResponsiveDialogContent className="sm:max-w-md">
                <ResponsiveDialogHeader>
                    <ResponsiveDialogTitle className="flex items-center gap-2 text-xl">
                        <Gift className="size-5 text-primary" />
                        {showClaimSuccess
                            ? t('dailyLogin.rewardClaimed')
                            : t('dailyLogin.dailyReward')}
                    </ResponsiveDialogTitle>
                    <ResponsiveDialogDescription>
                        {showClaimSuccess
                            ? t('dailyLogin.claimSuccessDescription')
                            : t('dailyLogin.claimDescription')}
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>

                {/* Streak Display */}
                <div className="flex items-center justify-center gap-2 py-2">
                    <Flame className="size-5 text-neon-pink" />
                    <span className="text-lg font-bold">
                        {t('dailyLogin.dayStreak', {
                            count: justClaimed?.newStreak ?? status.currentStreak,
                        })}
                    </span>
                    {status.currentStreak >= 7 && (
                        <Badge variant="outline" className="bg-neon-pink/10 border-neon-pink/30 text-neon-pink">
                            {t('dailyLogin.onFire')}
                        </Badge>
                    )}
                </div>

                {/* Reward Display */}
                {reward && (
                    <div className={cn(
                        'relative flex flex-col items-center p-6 rounded-lg border border-primary/30 bg-linear-to-b from-primary/10 to-transparent',
                        isAnimating && 'animate-pulse',
                        showClaimSuccess && 'border-success/50 bg-linear-to-b from-success/10 to-transparent'
                    )}>
                        {/* Sparkle effect on claim */}
                        {showClaimSuccess && (
                            <div className="absolute inset-0 pointer-events-none">
                                <Sparkles className="absolute top-2 left-4 size-4 text-warning animate-pulse" />
                                <Sparkles className="absolute top-4 right-6 size-3 text-warning animate-pulse delay-100" />
                                <Sparkles className="absolute bottom-4 left-8 size-3 text-warning animate-pulse delay-200" />
                            </div>
                        )}

                        <span className="text-4xl mb-2">{reward.iconUrl}</span>
                        <h3 className="font-bold text-lg text-center">
                            {t(`dailyLogin.rewards.day${reward.dayNumber}.name`, {
                                defaultValue: reward.displayName,
                            })}
                        </h3>
                        <p className="text-sm text-muted-foreground text-center mt-1">
                            {t(`dailyLogin.rewards.day${reward.dayNumber}.description`, {
                                defaultValue: reward.description ?? '',
                            })}
                        </p>

                        {/* Reward details */}
                        <div className="flex flex-wrap gap-2 mt-4 justify-center">
                            {reward.rewardValue.items.map((item: { key: string; quantity: number }) => (
                                <RewardItemBadgeLabel key={item.key} item={item} />
                            ))}
                            {reward.rewardValue.points > 0 && (
                                <Badge variant="secondary" className="bg-warning/20 text-warning">
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
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    )
}
