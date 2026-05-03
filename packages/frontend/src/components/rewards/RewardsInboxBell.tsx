import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'framer-motion'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { useAuth } from '@/hooks/useAuth'
import { useRewardsStore, wireRewardsSocketListener } from '@/stores/rewardsStore'
import { RewardCard } from './RewardCard'
import { cn } from '@/lib/utils'

interface RewardsInboxBellProps {
    className?: string
}

/**
 * Bell icon + drawer that surfaces async reward grants (reactivation,
 * milestones, payouts, …). The drawer reuses the `Sheet` primitive used by
 * the mobile menu so the visual language stays consistent. No toast on
 * arrival — the badge counter is the only signal, by design.
 */
export function RewardsInboxBell({ className }: RewardsInboxBellProps) {
    const { t } = useTranslation()
    const { session } = useAuth()
    const userId = session?.user?.id
    const isOpen = useRewardsStore((s) => s.isOpen)
    const openInbox = useRewardsStore((s) => s.openInbox)
    const closeInbox = useRewardsStore((s) => s.closeInbox)
    const fetchUnclaimed = useRewardsStore((s) => s.fetchUnclaimed)
    const reset = useRewardsStore((s) => s.reset)
    const unclaimed = useRewardsStore((s) => s.unclaimed)
    const isLoading = useRewardsStore((s) => s.isLoading)

    // Wire the cross-cutting `reward:granted` window listener once.
    useEffect(() => {
        wireRewardsSocketListener()
    }, [])

    // Fetch on session boundary changes. Reset on sign-out so a different
    // user doesn't briefly see the previous user's inbox.
    useEffect(() => {
        if (!userId) {
            reset()
            return
        }
        void fetchUnclaimed()
    }, [userId, fetchUnclaimed, reset])

    if (!userId) return null

    const count = unclaimed.length
    const handleOpenChange = (open: boolean) => {
        if (open) {
            openInbox()
            // Reconcile: pull authoritative list whenever the user opens the
            // drawer. Cheap, and protects against missed socket emits.
            void fetchUnclaimed()
        } else {
            closeInbox()
        }
    }

    return (
        <Sheet open={isOpen} onOpenChange={handleOpenChange}>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(true)}
                aria-label={t('rewards.inboxAria')}
                className={cn('relative flex items-center px-2 sm:px-3', className)}
            >
                <Bell
                    className={cn(
                        'w-4 h-4',
                        count > 0 ? 'text-neon-purple' : 'text-muted-foreground'
                    )}
                />
                {count > 0 && (
                    <Badge
                        variant="secondary"
                        className="ml-1 h-5 px-1.5 text-xs font-medium"
                    >
                        {count}
                    </Badge>
                )}
            </Button>
            <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>{t('rewards.inboxTitle')}</SheetTitle>
                </SheetHeader>
                <div className="mt-6 flex flex-col gap-3 overflow-y-auto pb-4">
                    {isLoading && unclaimed.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('rewards.loading')}</p>
                    ) : unclaimed.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('rewards.empty')}</p>
                    ) : (
                        <AnimatePresence initial={false}>
                            {unclaimed.map((g) => (
                                <RewardCard key={g.id} grant={g} />
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
