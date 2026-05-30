import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Share2, Twitter, MessageSquare, Copy, Check, Smartphone, MessageCircle } from 'lucide-react'
import type { GuessResult } from '@/types'
import { toast } from '@/lib/toast'
import { useSession } from '@/lib/auth-client'

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
    const { data: session } = useSession()
    const [copied, setCopied] = useState(false)
    const [open, setOpen] = useState(false)
    const referralCode = session?.user?.id

    // Generate emoji grid (Wordle-style)
    const generateEmojiGrid = (): string => {
        const sortedResults = guessResults.toSorted((a, b) => a.position - b.position)

        // Create rows of 5 emojis each (2 rows for 10 screenshots)
        const row1 = sortedResults.slice(0, 5).map(r => r.isCorrect ? '✅' : '❌').join('')
        const row2 = sortedResults.slice(5, 10).map(r => r.isCorrect ? '✅' : '❌').join('')

        return `${row1}\n${row2}`
    }

    type ShareChannel = 'twitter' | 'whatsapp' | 'sms' | 'discord' | 'native' | 'clipboard'

    // Per-channel UTM source so analytics can distinguish a WhatsApp paste
    // from a Twitter intent from a raw clipboard copy. Medium + campaign
    // stay constant so all share-card traffic rolls up under one filter.
    const buildShareUrl = (channel: ShareChannel, date: string): string => {
        const params = new URLSearchParams({
            date,
            lang: i18n.language,
            utm_source: channel,
            utm_medium: 'share_card',
            utm_campaign: 'daily_challenge',
        })
        if (referralCode) params.set('ref', referralCode)
        return `https://the-box.battistella.ovh/share/daily?${params.toString()}`
    }

    // Generate share text
    const generateShareText = (channel: ShareChannel): string => {
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

        // Point the share URL at /share/daily — the backend serves that
        // route with per-day OG meta + dynamic image so Twitter/Discord/etc.
        // render a unique preview for each shared challenge.
        text += `\n🔗 ${buildShareUrl(channel, date)}`

        return text
    }

    // Copy to clipboard
    const handleCopyToClipboard = async () => {
        const text = generateShareText('clipboard')
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
        const text = generateShareText('twitter')
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
        window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420')
    }

    // Share to Discord
    const handleShareDiscord = () => {
        const text = generateShareText('discord')
        // Discord doesn't have a direct web intent, so we copy and suggest pasting
        navigator.clipboard.writeText(text).then(() => {
            toast.success(t('share.discordCopied'))
        }).catch(err => {
            console.error('Failed to copy for Discord:', err)
        })
    }

    // Native share sheet (iOS/Android + desktop Safari/Edge) — opens the
    // platform share UI so users can hit WhatsApp, Messages, Mail, etc.
    // without us maintaining one-off buttons per app.
    const canUseNativeShare =
        typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    const handleNativeShare = async () => {
        const text = generateShareText('native')
        try {
            await navigator.share({ title: 'The Box', text })
        } catch (err) {
            // AbortError = user cancelled — swallow silently
            if ((err as { name?: string })?.name !== 'AbortError') {
                console.error('Native share failed:', err)
            }
        }
    }

    const handleShareWhatsApp = () => {
        const text = generateShareText('whatsapp')
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`
        window.open(url, '_blank', 'noopener,noreferrer')
    }

    const handleShareSms = () => {
        const text = generateShareText('sms')
        // `sms:` has patchy body-parameter support across platforms; `?&body=`
        // is the iOS form, `?body=` works on Android. Use `?&body=` which
        // works on both modern iOS and Android.
        const url = `sms:?&body=${encodeURIComponent(text)}`
        window.location.href = url
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="gaming"
                    size={compact ? "sm" : "lg"}
                    className={compact ? "shrink-0" : "w-full sm:w-auto"}
                >
                    <Share2 className="size-4 mr-2" />
                    <span>{t('common.share')}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
                <div className="flex flex-col gap-1">
                    {canUseNativeShare && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                void handleNativeShare()
                                setOpen(false)
                            }}
                            className="justify-start"
                        >
                            <Smartphone className="size-4 mr-2" />
                            {t('share.native')}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            handleShareTwitter()
                            setOpen(false)
                        }}
                        className="justify-start"
                    >
                        <Twitter className="size-4 mr-2" />
                        {t('share.twitter')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            handleShareWhatsApp()
                            setOpen(false)
                        }}
                        className="justify-start"
                    >
                        <MessageCircle className="size-4 mr-2" />
                        {t('share.whatsapp')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            handleShareSms()
                            setOpen(false)
                        }}
                        className="justify-start"
                    >
                        <MessageSquare className="size-4 mr-2" />
                        {t('share.sms')}
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
                        <MessageSquare className="size-4 mr-2" />
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
                            <Check className="size-4 mr-2 text-success" />
                        ) : (
                            <Copy className="size-4 mr-2" />
                        )}
                        {copied ? t('share.copied') : t('share.copyLink')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
