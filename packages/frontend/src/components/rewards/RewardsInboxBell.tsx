import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence } from 'framer-motion'
import { Bell, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Sheet,
    SheetContent,
    SheetDescription,
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

    useEffect(() => {
        wireRewardsSocketListener()
    }, [])

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
            void fetchUnclaimed()
        } else {
            closeInbox()
        }
    }

    return (
        <Sheet open={isOpen} onOpenChange={handleOpenChange}>
            <Button
                variant="ghost"
                onClick={() => handleOpenChange(true)}
                aria-label={count > 0 ? `${t('rewards.inboxAria')} (${count})` : t('rewards.inboxAria')}
                className={cn('relative flex items-center px-2 sm:px-3', className)}
            >
                <Bell
                    aria-hidden="true"
                    className={cn(
                        'size-4',
                        count > 0 ? 'text-neon-purple' : 'text-muted-foreground'
                    )}
                />
                {count > 0 && (
                    <Badge
                        variant="secondary"
                        aria-hidden="true"
                        className="ml-1 h-5 px-1.5 text-xs font-medium"
                    >
                        {count}
                    </Badge>
                )}
            </Button>
            <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>{t('rewards.inboxTitle')}</SheetTitle>
                    <SheetDescription className="sr-only">
                        {t('rewards.inboxDescription')}
                    </SheetDescription>
                </SheetHeader>
                <div
                    aria-busy={isLoading && unclaimed.length === 0 ? true : undefined}
                    className="mt-4 flex flex-col gap-3 pb-4"
                >
                    {isLoading && unclaimed.length === 0 ? (
                        <>
                            <span className="sr-only">{t('rewards.loading')}</span>
                            {[0, 1].map((i) => (
                                <div key={i} className="space-y-3 rounded-lg border border-border p-4">
                                    <div className="flex items-start gap-3">
                                        <Skeleton className="size-10 rounded-md" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-2/3" variant="text" />
                                            <Skeleton className="h-3 w-1/2" variant="text" />
                                        </div>
                                    </div>
                                    <Skeleton className="ml-auto h-10 w-28" />
                                </div>
                            ))}
                        </>
                    ) : unclaimed.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                                <Gift className="size-6 text-muted-foreground" aria-hidden="true" />
                            </span>
                            <p className="text-sm text-muted-foreground">{t('rewards.empty')}</p>
                            <Button variant="outline" onClick={() => handleOpenChange(false)}>
                                {t('common.close')}
                            </Button>
                        </div>
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
