import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDailyLoginStore } from '@/stores/dailyLoginStore'
import { cn } from '@/lib/utils'
import { Gift } from 'lucide-react'

interface DailyRewardBadgeProps {
    className?: string
}

export function DailyRewardBadge({ className }: DailyRewardBadgeProps) {
    const { t } = useTranslation()
    const { status, openModal, isLoading } = useDailyLoginStore()

    // Don't render if no status or loading
    if (isLoading || !status) return null

    const canClaim = status.canClaim
    const streak = status.currentStreak

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={openModal}
                        className={cn(
                            'relative flex items-center gap-1.5 px-2 sm:px-3',
                            className
                        )}
                    >
                        <Gift className={cn(
                            'w-4 h-4',
                            canClaim ? 'text-primary' : 'text-muted-foreground'
                        )} />

                        {/* Streak count as subtle badge */}
                        {streak > 0 && (
                            <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-xs font-medium"
                            >
                                {streak}
                            </Badge>
                        )}

                        {/* Notification dot when can claim */}
                        {canClaim && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    {canClaim ? (
                        <p>{t('dailyLogin.claimAvailable')}</p>
                    ) : (
                        <p>{t('dailyLogin.streakDays', { count: streak })}</p>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
