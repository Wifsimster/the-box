import type { NewlyEarnedAchievement } from '@the-box/types'
import { motion } from 'framer-motion'
import { toast as sonner } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkles, Trophy, X } from 'lucide-react'

interface AchievementToastBodyProps {
    achievement: NewlyEarnedAchievement
    toastId: string | number
}

// Tier gradients map to semantic tokens; see AchievementCard for the palette rationale.
const tierColors = {
    1: 'from-warning/20 to-warning/5 border-warning/50',
    2: 'from-primary/20 to-primary/5 border-primary/50',
    3: 'from-neon-cyan/20 to-neon-cyan/5 border-neon-cyan/50',
}

/**
 * Visual body for the achievement-unlocked sonner toast. Exported for
 * reuse inside `sonner.toast.custom(...)` — see `showAchievementToast`.
 */
export function AchievementToastBody({ achievement, toastId }: AchievementToastBodyProps) {
    const tierGradient = tierColors[achievement.tier as keyof typeof tierColors] || tierColors[1]

    return (
        <Card className={`relative overflow-hidden border-2 bg-linear-to-br ${tierGradient} shadow-2xl w-full max-w-md`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />

            <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 rounded-full opacity-70 hover:opacity-100 z-10"
                onClick={() => sonner.dismiss(toastId)}
            >
                <X className="h-4 w-4" />
            </Button>

            <CardHeader className="pb-3 relative">
                <div className="flex items-center gap-2 mb-2">
                    <motion.div
                        animate={{
                            rotate: [0, 10, -10, 10, 0],
                            scale: [1, 1.1, 1, 1.1, 1],
                        }}
                        transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
                    >
                        <Trophy className="h-5 w-5 text-warning" />
                    </motion.div>
                    <span className="text-sm font-semibold text-warning flex items-center gap-1">
                        <Sparkles className="h-4 w-4" />
                        Achievement Unlocked!
                    </span>
                </div>

                <div className="flex items-start gap-3">
                    <motion.div
                        className="text-5xl"
                        animate={{
                            scale: [1, 1.2, 1],
                            rotate: [0, 5, -5, 0],
                        }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        {achievement.iconUrl || '🏆'}
                    </motion.div>
                    <div className="flex-1">
                        <CardTitle className="text-xl">{achievement.name}</CardTitle>
                        <CardDescription className="mt-1 text-muted-foreground">
                            {achievement.description}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0 relative">
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                        +{achievement.points} points
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">
                        {achievement.category}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    )
}

/**
 * Fire a rich, gaming-styled achievement toast through sonner. Replaces
 * the pre-sprint-3 `<AchievementNotificationContainer>` component.
 */
export function showAchievementToast(achievement: NewlyEarnedAchievement): void {
    sonner.custom(
        (id) => <AchievementToastBody achievement={achievement} toastId={id} />,
        { duration: 5000 }
    )
}
