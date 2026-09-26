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
import { CircleCheck, Flame, Gift, Loader2, Sparkles } from 'lucide-react'
import { RewardIcon } from './RewardIcon'
import {
    getRarityStyle,
    getRewardRarity,
    RARITY_CLAIM_ANIMATION,
} from '@/lib/rarity'

// i18n key per item_key. Unknown keys (including the metadata hints
// retired 2026-06, which can still appear on historical claims) fall
// back to the raw item_key so a missing translation does not break
// the modal.
const REWARD_ITEM_I18N_KEY: Record<string, string> = {
    hint_letter: 'dailyLogin.hintLetter',
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
        // Keep the modal open after claiming so the player can read what they
        // won. The success state renders a "Fermer" button for manual dismissal
        // instead of auto-closing out from under them.
        setIsAnimating(false)
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

    const rarity = reward ? getRewardRarity(reward) : 'common'
    const rarityStyle = reward ? getRarityStyle(reward) : null

    const displayStreak = justClaimed?.newStreak ?? status.currentStreak
    const dayInCycle = justClaimed?.newDayInCycle || status.currentDayInCycle
    const hasClaimed = showClaimSuccess || status.hasClaimedToday
    const cycleLength = status.allRewards.length
    const daysReached = hasClaimed ? dayInCycle : dayInCycle - 1
    const daysUntilChest = Math.max(cycleLength - daysReached, 0)

    return (
        <ResponsiveDialog open={isModalOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
            <ResponsiveDialogContent className="sm:max-w-md gap-5 sm:gap-6 overflow-x-hidden">
                <ResponsiveDialogHeader className="items-center text-center sm:text-center">
                    <ResponsiveDialogTitle
                        className={cn(
                            'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest',
                            showClaimSuccess ? 'text-success' : 'text-primary'
                        )}
                    >
                        {showClaimSuccess
                            ? <CircleCheck className="size-4" aria-hidden />
                            : <Gift className="size-4" aria-hidden />}
                        {showClaimSuccess
                            ? t('dailyLogin.rewardClaimed')
                            : t('dailyLogin.dailyReward')}
                    </ResponsiveDialogTitle>
                    <ResponsiveDialogDescription className="sr-only">
                        {showClaimSuccess
                            ? t('dailyLogin.claimSuccessDescription')
                            : t('dailyLogin.claimDescription')}
                    </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>

                {/* Reward hero */}
                {reward && rarityStyle && (
                    <div className="flex flex-col items-center text-center">
                        <div className="relative flex size-36 items-center justify-center">
                            {/* Light rays behind the medallion, tinted by rarity */}
                            <div
                                aria-hidden
                                className={cn(
                                    'reward-rays absolute inset-0 transition-opacity duration-500',
                                    rarityStyle.sparkle,
                                    showClaimSuccess ? 'opacity-100' : 'opacity-40'
                                )}
                            />
                            <div
                                aria-hidden
                                className={cn('absolute inset-6 rounded-full blur-2xl opacity-40 bg-current', rarityStyle.text)}
                            />
                            <div
                                style={{ boxShadow: rarityStyle.glow }}
                                className={cn(
                                    'relative flex size-20 items-center justify-center rounded-2xl border-2 bg-card',
                                    rarityStyle.border,
                                    isAnimating && !showClaimSuccess && 'motion-safe:animate-pulse',
                                    showClaimSuccess && RARITY_CLAIM_ANIMATION[rarity]
                                )}
                            >
                                <div className={cn('absolute inset-0 rounded-[14px] bg-linear-to-b', rarityStyle.gradient)} />
                                <RewardIcon reward={reward} className={cn('relative size-10', rarityStyle.text)} strokeWidth={1.75} aria-hidden />
                            </div>
                            {showClaimSuccess && (
                                <div aria-hidden className="pointer-events-none absolute inset-0">
                                    <Sparkles className={cn('absolute left-3 top-5 size-4 motion-safe:animate-pulse', rarityStyle.sparkle)} />
                                    <Sparkles
                                        className={cn('absolute bottom-6 right-3 size-3.5 motion-safe:animate-pulse', rarityStyle.sparkle)}
                                        style={{ animationDelay: '200ms' }}
                                    />
                                    {(rarity === 'epic' || rarity === 'legendary') && (
                                        <Sparkles
                                            className={cn('absolute right-5 top-2 size-3 motion-safe:animate-pulse', rarityStyle.sparkle)}
                                            style={{ animationDelay: '350ms' }}
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                        <Badge
                            variant="outline"
                            className={cn('-mt-1 uppercase tracking-widest text-[10px]', rarityStyle.badge, rarityStyle.border)}
                        >
                            {t(rarityStyle.labelKey)}
                        </Badge>

                        <h3 className="mt-3 text-2xl font-bold tracking-tight text-balance">
                            {t(`dailyLogin.rewards.day${reward.dayNumber}.name`, {
                                defaultValue: reward.displayName,
                            })}
                        </h3>
                        <p className="mt-1 max-w-xs text-sm text-muted-foreground text-balance">
                            {t(`dailyLogin.rewards.day${reward.dayNumber}.description`, {
                                defaultValue: reward.description ?? '',
                            })}
                        </p>

                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {reward.rewardValue.items.map((item: { key: string; quantity: number }) => (
                                <RewardItemBadgeLabel key={item.key} item={item} />
                            ))}
                            {reward.rewardValue.points > 0 && (
                                <Badge variant="secondary" className="bg-warning/15 text-warning">
                                    +{reward.rewardValue.points} {t('dailyLogin.points')}
                                </Badge>
                            )}
                        </div>
                        {showClaimSuccess && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                {t('dailyLogin.addedToInventory')}
                            </p>
                        )}
                    </div>
                )}

                {/* Streak + weekly track */}
                <section className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="flex size-8 items-center justify-center rounded-full bg-neon-pink/15">
                                <Flame className="size-4 text-neon-pink" aria-hidden />
                            </span>
                            <div className="leading-tight">
                                <p className="text-sm font-bold">
                                    {t('dailyLogin.dayStreak', { count: displayStreak })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {daysUntilChest > 0
                                        ? t('dailyLogin.untilChest', { count: daysUntilChest })
                                        : t('dailyLogin.chestReached')}
                                </p>
                            </div>
                        </div>
                        {displayStreak >= 7 ? (
                            <Badge variant="outline" className="shrink-0 bg-neon-pink/10 border-neon-pink/30 text-neon-pink">
                                {t('dailyLogin.onFire')}
                            </Badge>
                        ) : (
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                                {Math.max(daysReached, 0)}/{cycleLength}
                            </span>
                        )}
                    </div>
                    <RewardCalendar
                        rewards={status.allRewards}
                        currentDayInCycle={dayInCycle}
                        hasClaimedToday={hasClaimed}
                    />
                </section>

                {/* Action Button */}
                {showClaimSuccess ? (
                    <Button onClick={handleClose} variant="gaming" size="lg" className="w-full">
                        {t('common.close')}
                    </Button>
                ) : status.canClaim ? (
                    <Button
                        onClick={handleClaim}
                        disabled={isClaiming}
                        variant="gaming"
                        size="lg"
                        className="w-full"
                    >
                        {isClaiming ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                                {t('dailyLogin.claiming')}
                            </span>
                        ) : (
                            t('dailyLogin.claimReward')
                        )}
                    </Button>
                ) : (
                    <Button onClick={handleClose} variant="outline" size="lg" className="w-full">
                        {t('dailyLogin.alreadyClaimed')}
                    </Button>
                )}
            </ResponsiveDialogContent>
        </ResponsiveDialog>
    )
}
