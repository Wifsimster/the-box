import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Share2, Twitter, MessageSquare, Copy, Check } from 'lucide-react'
import type { GuessResult } from '@/types'
import { toast } from '@/lib/toast'

interface ShareCardProps {
    score: number
    correctAnswers: number
    totalScreenshots: number
    percentile?: number
    rank?: number
    totalPlayers?: number
    challengeDate?: string
    guessResults: GuessResult[]
    compact?: boolean
}

export function ShareCard({
    score,
    correctAnswers,
    totalScreenshots,
    percentile,
    rank,
    totalPlayers,
    challengeDate,
    guessResults,
    compact = false,
}: ShareCardProps) {
    const { t, i18n } = useTranslation()
    const [copied, setCopied] = useState(false)
    const [open, setOpen] = useState(false)

    // Generate emoji grid (Wordle-style)
    const generateEmojiGrid = (): string => {
        const sortedResults = [...guessResults].sort((a, b) => a.position - b.position)

        // Create rows of 5 emojis each (2 rows for 10 screenshots)
        const row1 = sortedResults.slice(0, 5).map(r => r.isCorrect ? '✅' : '❌').join('')
        const row2 = sortedResults.slice(5, 10).map(r => r.isCorrect ? '✅' : '❌').join('')

        return `${row1}\n${row2}`
    }

    // Generate share text
    const generateShareText = (): string => {
        const date = challengeDate || new Date().toISOString().split('T')[0]
        const emojiGrid = generateEmojiGrid()

        let text = `🎮 The Box Daily Challenge\n`
        text += `📅 ${date}\n\n`
        text += `${emojiGrid}\n\n`
        text += `🎯 ${correctAnswers}/${totalScreenshots} correct\n`
        text += `⭐ ${score} points\n`

        if (percentile !== undefined) {
            text += `🏆 Top ${percentile}%\n`
        } else if (rank !== undefined && totalPlayers !== undefined) {
            text += `🏆 Rank #${rank}/${totalPlayers}\n`
        }

        text += `\n🔗 https://the-box.battistella.ovh/${i18n.language}/leaderboard?date=${date}`

        return text
    }

    // Copy to clipboard
    const handleCopyToClipboard = async () => {
        const text = generateShareText()
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            toast.success(t('share.copied'))
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
            toast.error(t('share.copyError'))
        }
    }

    // Share to Twitter
    const handleShareTwitter = () => {
        const text = generateShareText()
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
        window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420')
    }

    // Share to Discord
    const handleShareDiscord = () => {
        const text = generateShareText()
        // Discord doesn't have a direct web intent, so we copy and suggest pasting
        navigator.clipboard.writeText(text).then(() => {
            toast.success(t('share.discordCopied'))
        }).catch(err => {
            console.error('Failed to copy for Discord:', err)
        })
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="gaming"
                    size={compact ? "sm" : "lg"}
                    className={compact ? "shrink-0" : "w-full sm:w-auto"}
                >
                    <Share2 className="w-4 h-4 mr-2" />
                    <span>{t('common.share')}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
                <div className="flex flex-col gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            handleShareTwitter()
                            setOpen(false)
                        }}
                        className="justify-start"
                    >
                        <Twitter className="w-4 h-4 mr-2" />
                        {t('share.twitter')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            handleShareDiscord()
                            setOpen(false)
                        }}
                        className="justify-start"
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        {t('share.discord')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            handleCopyToClipboard()
                        }}
                        className="justify-start"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 mr-2 text-success" />
                        ) : (
                            <Copy className="w-4 h-4 mr-2" />
                        )}
                        {copied ? t('share.copied') : t('share.copyLink')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
