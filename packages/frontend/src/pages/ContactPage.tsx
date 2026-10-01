import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Bug,
  Building2,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Mail,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'
import { ContentPage } from '@/components/content/ContentPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { STUDIO } from '@/lib/studio'

interface ContactMethod {
  icon: LucideIcon
  title: string
  content: string
  href: string
  actionLabel: string
  external: boolean
}

export default function ContactPage() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const email = t('legal.contactEmail')

  const bugReportHref = `mailto:${email}?${new URLSearchParams({
    subject: t('legal.contactBugSubject'),
    body: t('legal.contactBugBody', {
      device: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    }),
  })
    .toString()
    .replace(/\+/g, '%20')}`

  const contactMethods: ContactMethod[] = [
    {
      icon: Bug,
      title: t('legal.contactBugTitle'),
      content: t('legal.contactBug'),
      href: bugReportHref,
      actionLabel: t('legal.contactBugAction'),
      external: false,
    },
    {
      icon: MessageSquare,
      title: t('legal.contactSocialTitle'),
      content: t('legal.contactSocial'),
      href: 'https://discord.gg/5pRQGWvcj',
      actionLabel: t('legal.contactSocialDiscord'),
      external: true,
    },
    {
      icon: Building2,
      title: t('legal.contactStudioTitle'),
      content: t('legal.contactStudio', { studio: STUDIO.name }),
      href: STUDIO.url,
      actionLabel: `${t('legal.studioWebsite')} — ${STUDIO.domain}`,
      external: true,
    },
  ]

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      toast.success(t('share.copied'))
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('share.copyError'))
    }
  }

  return (
    <ContentPage icon={Mail} title={t('legal.contactTitle')} subtitle={t('legal.contactIntro')}>
      <Card variant="neon">
        <CardHeader>
          <h2 className="text-sm font-medium text-muted-foreground">
            {t('legal.contactEmailTitle')}
          </h2>
          <p className="text-lg font-semibold text-foreground break-all sm:text-xl">{email}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="gaming" size="lg" className="w-full sm:w-auto">
              <a href={`mailto:${email}`}>
                <Mail aria-hidden="true" />
                {t('legal.contactEmailAction')}
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              onClick={copyEmail}
            >
              {copied ? <Check className="text-success" aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {t('legal.contactCopyEmail')}
            </Button>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            {t('legal.contactResponseTime')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <ul className="divide-y divide-border">
          {contactMethods.map((method) => (
            <li key={method.title} className="first:*:rounded-t-xl last:*:rounded-b-xl">
              <a
                href={method.href}
                {...(method.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="group flex items-start gap-3 p-(--card-padding) transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <method.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-foreground">{method.title}</span>
                  <span className="block text-sm text-muted-foreground">{method.content}</span>
                  <span className="block text-sm font-medium text-primary group-hover:text-neon-pink">
                    {method.actionLabel}
                    {method.external && <span className="sr-only"> {t('legal.opensInNewTab')}</span>}
                  </span>
                </span>
                <ChevronRight
                  className="mt-2.5 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </ContentPage>
  )
}
