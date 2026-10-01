import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { UserPlus, Copy, Check, Gift, Share2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { referralApi, type ReferralStats } from '@/lib/api/referral'

interface ReferralCardProps {
  userId: string
  language: string
}

function buildInviteUrl(userId: string, language: string): string {
  const origin = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://the-box.battistella.ovh'
  const params = new URLSearchParams({ ref: userId })
  return `${origin}/${language}?${params.toString()}`
}

export function ReferralCard({ userId, language }: ReferralCardProps) {
  const { t } = useTranslation()
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [copied, setCopied] = useState(false)

  const inviteUrl = buildInviteUrl(userId, language)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    let cancelled = false
    referralApi.getStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        // Stats are a soft read — degrade silently
      })
    return () => { cancelled = true }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      toast.success(t('referral.copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('referral.copyError'))
    }
  }

  const handleShare = async () => {
    try {
      await navigator.share({ title: t('referral.title'), url: inviteUrl })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      void handleCopy()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-5" aria-hidden="true" />
          {t('referral.title')}
        </CardTitle>
        <CardDescription>{t('referral.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            readOnly
            value={inviteUrl}
            aria-label={t('referral.linkLabel')}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs sm:text-sm"
          />
          <div className="flex gap-2">
            <Button
              variant={canShare ? 'outline' : 'gaming'}
              onClick={handleCopy}
              className="flex-1 sm:flex-none"
              aria-live="polite"
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? t('referral.copied') : t('referral.copyLink')}
            </Button>
            {canShare && (
              <Button variant="gaming" onClick={handleShare} className="flex-1 sm:flex-none">
                <Share2 aria-hidden="true" />
                {t('common.share')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline" className="gap-1.5">
            <Gift className="size-3.5" aria-hidden="true" />
            {t('referral.stat', { count: stats?.referralsMade ?? 0 })}
          </Badge>
          {stats?.hasClaimed && (
            <span className="text-xs text-muted-foreground">{t('referral.claimedNote')}</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">{t('referral.rewardHint')}</p>
      </CardContent>
    </Card>
  )
}
