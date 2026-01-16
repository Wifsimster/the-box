import { useEffect, useState } from 'react'
import type { NewlyEarnedAchievement } from '@the-box/types'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AchievementNotificationProps {
    achievement: NewlyEarnedAchievement
    onClose: () => void
    autoCloseDuration?: number
}

const tierColors = {
    1: 'from-amber-600/20 to-amber-900/20 border-amber-600/50',
    2: 'from-purple-600/20 to-purple-900/20 border-purple-600/50',
    3: 'from-cyan-600/20 to-cyan-900/20 border-cyan-600/50',
}

export function AchievementNotification({
    achievement,
    onClose,
    autoCloseDuration = 5000,
}: AchievementNotificationProps) {
    const [isVisible, setIsVisible] = useState(true)

    useEffect(() => {
        if (autoCloseDuration > 0) {
            const timer = setTimeout(() => {
                setIsVisible(false)
                setTimeout(onClose, 300) // Wait for exit animation
            }, autoCloseDuration)

            return () => clearTimeout(timer)
        }
    }, [autoCloseDuration, onClose])

    const tierGradient = tierColors[achievement.tier as keyof typeof tierColors] || tierColors[1]

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: -50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: 'spring', duration: 0.5 }}
                >
                    <Card className={`relative overflow-hidden border-2 bg-linear-to-br ${tierGradient} shadow-2xl`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />

                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-6 w-6 rounded-full opacity-70 hover:opacity-100 z-10"
                            onClick={() => {
                                setIsVisible(false)
                                setTimeout(onClose, 300)
                            }}
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
                                    transition={{
                                        duration: 1,
                                        repeat: Infinity,
                                        repeatDelay: 2,
                                    }}
                                >
                                    <Trophy className="h-5 w-5 text-yellow-400" />
                                </motion.div>
                                <span className="text-sm font-semibold text-yellow-400 flex items-center gap-1">
                                    <Sparkles className="h-4 w-4" />
                                    Achievement Unlocked!
                                </span>
                            </div>

                            <div className="flex items-start gap-3">
                                <motion.div
                                    className="text-5xl"
                                    animate={{
                                        scale: [1, 1.2, 1],
                                        rotate: [0, 5, -5, 0]
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
                </motion.div>
            )}
        </AnimatePresence>
    )
}

interface AchievementNotificationContainerProps {
    achievements: NewlyEarnedAchievement[]
    onDismiss: (key: string) => void
}

export function AchievementNotificationContainer({
    achievements,
    onDismiss,
}: AchievementNotificationContainerProps) {
    return (
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 max-w-md w-full">
            <AnimatePresence mode="popLayout">
                {achievements.map((achievement) => (
                    <AchievementNotification
                        key={achievement.key}
                        achievement={achievement}
                        onClose={() => onDismiss(achievement.key)}
                    />
                ))}
            </AnimatePresence>
        </div>
    )
}
