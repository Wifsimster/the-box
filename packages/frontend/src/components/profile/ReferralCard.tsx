import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { UserPlus, Copy, Check, Gift } from 'lucide-react'
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          {t('referral.title')}
        </CardTitle>
        <CardDescription>{t('referral.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input readOnly value={inviteUrl} className="font-mono text-xs sm:text-sm" />
          <Button variant="gaming" onClick={handleCopy} className="shrink-0">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? t('referral.copied') : t('referral.copyLink')}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline" className="gap-1.5">
            <Gift className="h-3.5 w-3.5" />
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
