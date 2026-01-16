import { create } from 'zustand'
import type {
    Achievement,
    AchievementWithProgress,
    AchievementStats,
    NewlyEarnedAchievement,
} from '@the-box/types'

interface AchievementNotification {
    achievement: NewlyEarnedAchievement
    seen: boolean
    timestamp: number
}

interface AchievementState {
    // All achievements (loaded once)
    achievements: Achievement[]

    // User's achievements with progress
    userAchievements: AchievementWithProgress[]

    // Achievement statistics
    stats: AchievementStats | null

    // Notifications for newly earned achievements
    notifications: AchievementNotification[]

    // Loading states
    isLoading: boolean
    isLoadingUserAchievements: boolean

    // Actions
    fetchAchievements: () => Promise<void>
    fetchUserAchievements: (userId?: string) => Promise<void>
    addNotifications: (newAchievements: NewlyEarnedAchievement[]) => void
    markNotificationAsSeen: (achievementKey: string) => void
    clearNotifications: () => void
    reset: () => void
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
    achievements: [],
    userAchievements: [],
    stats: null,
    notifications: [],
    isLoading: false,
    isLoadingUserAchievements: false,

    fetchAchievements: async () => {
        set({ isLoading: true })
        try {
            const response = await fetch(`/api/achievements`, {
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error('Failed to fetch achievements')
            }

            const json = await response.json()
            set({ achievements: json.data, isLoading: false })
        } catch (error) {
            console.error('Failed to fetch achievements:', error)
            set({ isLoading: false })
        }
    },

    fetchUserAchievements: async (userId?: string) => {
        set({ isLoadingUserAchievements: true })
        try {
            const endpoint = userId
                ? `/api/achievements/user/${userId}`
                : `/api/achievements/me`

            const response = await fetch(endpoint, {
                credentials: 'include',
            })

            if (!response.ok) {
                throw new Error('Failed to fetch user achievements')
            }

            const json = await response.json()
            set({
                userAchievements: json.data.achievements,
                stats: json.data.stats,
                isLoadingUserAchievements: false,
            })
        } catch (error) {
            console.error('Failed to fetch user achievements:', error)
            set({ isLoadingUserAchievements: false })
        }
    },

    addNotifications: (newAchievements: NewlyEarnedAchievement[]) => {
        const currentNotifications = get().notifications
        const newNotifications: AchievementNotification[] = newAchievements.map(achievement => ({
            achievement,
            seen: false,
            timestamp: Date.now(),
        }))

        set({ notifications: [...currentNotifications, ...newNotifications] })
    },

    markNotificationAsSeen: (achievementKey: string) => {
        set(state => ({
            notifications: state.notifications.map(n =>
                n.achievement.key === achievementKey ? { ...n, seen: true } : n
            ),
        }))
    },

    clearNotifications: () => {
        set({ notifications: [] })
    },

    reset: () => {
        set({
            achievements: [],
            userAchievements: [],
            stats: null,
            notifications: [],
            isLoading: false,
            isLoadingUserAchievements: false,
        })
    },
}))
