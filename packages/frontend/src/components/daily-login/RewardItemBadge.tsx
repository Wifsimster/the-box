import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'

interface RewardItemBadgeProps {
    item: { key: string; quantity: number }
}

// i18n key per item_key. New keys (hint_developer, hint_genre,
// streak_freeze, second_chance) fall back to the raw item_key so
// a missing translation does not break the modal.
const I18N_KEY_BY_ITEM: Record<string, string> = {
    hint_year: 'dailyLogin.hintYear',
    hint_publisher: 'dailyLogin.hintPublisher',
    hint_developer: 'dailyLogin.hintDeveloper',
    hint_genre: 'dailyLogin.hintGenre',
    streak_freeze: 'dailyLogin.streakFreeze',
    second_chance: 'dailyLogin.secondChance',
}

export function RewardItemBadge({ item }: RewardItemBadgeProps) {
    const { t } = useTranslation()
    const label = t(I18N_KEY_BY_ITEM[item.key] ?? '', { defaultValue: item.key })

    return (
        <Badge variant="secondary" className="bg-primary/20">
            {`${item.quantity}× ${label}`}
        </Badge>
    )
}
