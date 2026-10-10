import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Share2, Twitter, MessageSquare, Copy, Check, Smartphone, MessageCircle } from 'lucide-react'
import type { GuessResult } from '@/types'
import { toast } from '@/lib/toast'
import { useSession } from '@/lib/auth-client'
import { dailyCardFileName, dailyCardUrl, shareWithOptionalImage } from '@/lib/shareImage'

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
    const [todayIso] = useState(() => new Date().toISOString().split('T')[0]!)
    const shareDate = challengeDate || todayIso

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

    // Generate share text.
    //
    // This is the single most-seen brand surface: most impressions of The Box
    // happen in someone else's feed, not on the site. It used to be hardcoded
    // English on a French-default product ("The Box Daily Challenge", "correct",
    // "points"), so it is now localised and carries the box sentence from
    // docs/brand.md §5 — date, score, verb, no emoji in the base line.
    const generateShareText = (channel: ShareChannel): string => {
        const date = shareDate
        const emojiGrid = generateEmojiGrid()
        const readableDate = new Intl.DateTimeFormat(i18n.language, {
            day: 'numeric',
            month: 'long',
        }).format(new Date(`${date}T00:00:00Z`))

        let text = `${t('share.result', {
            date: readableDate,
            score,
            found: correctAnswers,
            total: totalScreenshots,
        })}\n\n`
        text += `${emojiGrid}\n\n`

        if (percentile !== undefined) {
            text += `${t('share.rankPercentile', { percentile })}\n`
        } else if (rank !== undefined && totalPlayers !== undefined) {
            text += `${t('share.rankPosition', { rank, total: totalPlayers })}\n`
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

    // The card is fetched ahead of the tap: iOS Safari drops the user
    // activation if `navigator.share` waits on a network request, so the
    // file must already be in memory when the button is pressed.
    const cardFileRef = useRef<File | null>(null)
    const cardLang = i18n.language
    useEffect(() => {
        cardFileRef.current = null
        if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return
        const controller = new AbortController()
        fetch(dailyCardUrl(shareDate, cardLang), { signal: controller.signal })
            .then((res) => (res.ok ? res.blob() : null))
            .then((blob) => {
                if (!blob || !blob.type.startsWith('image/')) return
                cardFileRef.current = new File([blob], dailyCardFileName(shareDate), { type: blob.type })
            })
            .catch(() => {
                // No card: the share falls back to text only.
            })
        return () => controller.abort()
    }, [shareDate, cardLang])

    const handleNativeShare = async (): Promise<boolean> => {
        const text = generateShareText('native')
        const outcome = await shareWithOptionalImage(navigator, text, cardFileRef.current)
        if (outcome === 'failed') console.error('Native share failed')
        // A cancel counts as handled: the player closed the sheet on purpose.
        return outcome !== 'failed'
    }

    // On phones the OS share sheet already lists every app the player uses,
    // so the share button opens it in one tap and the menu is only a fallback.
    const handleTriggerClick = (e: React.MouseEvent) => {
        if (open || !canUseNativeShare) return
        if (!window.matchMedia?.('(pointer: coarse)').matches) return
        e.preventDefault()
        void handleNativeShare().then((shared) => {
            if (!shared) setOpen(true)
        })
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
                    onClick={handleTriggerClick}
                >
                    <Share2 className="size-4" aria-hidden="true" />
                    <span>{t('common.share')}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-64 max-w-[calc(100vw-2rem)] p-2">
                <div className="flex flex-col gap-1">
                    {canUseNativeShare && (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                void handleNativeShare()
                                setOpen(false)
                            }}
                            className="w-full justify-start"
                        >
                            <Smartphone className="size-4" aria-hidden="true" />
                            {t('share.native')}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        onClick={() => {
                            handleShareTwitter()
                            setOpen(false)
                        }}
                        className="w-full justify-start"
                    >
                        <Twitter className="size-4" aria-hidden="true" />
                        {t('share.twitter')}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            handleShareWhatsApp()
                            setOpen(false)
                        }}
                        className="w-full justify-start"
                    >
                        <MessageCircle className="size-4" aria-hidden="true" />
                        {t('share.whatsapp')}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            handleShareSms()
                            setOpen(false)
                        }}
                        className="w-full justify-start"
                    >
                        <MessageSquare className="size-4" aria-hidden="true" />
                        {t('share.sms')}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            handleShareDiscord()
                            setOpen(false)
                        }}
                        className="w-full justify-start"
                    >
                        <MessageSquare className="size-4" aria-hidden="true" />
                        {t('share.discord')}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => {
                            handleCopyToClipboard()
                        }}
                        className="w-full justify-start"
                    >
                        {copied ? (
                            <Check className="size-4 text-success" aria-hidden="true" />
                        ) : (
                            <Copy className="size-4" aria-hidden="true" />
                        )}
                        {copied ? t('share.copied') : t('share.copyLink')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
