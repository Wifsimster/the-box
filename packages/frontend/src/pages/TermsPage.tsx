import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText } from 'lucide-react'
import { LegalDocument } from '@/components/content/LegalDocument'
import { STUDIO } from '@/lib/studio'

export default function TermsPage() {
  const { t } = useTranslation()

  // Rendered apart from the plain sections so the studio site can be a real
  // link: LCEN art. 6-III expects the publisher's identity to be reachable,
  // not just spelled out.
  const publisher = t('legal.termsPublisher', {
    studio: STUDIO.name,
    legalName: STUDIO.legalName,
    founder: STUDIO.founder,
    city: STUDIO.city,
    siret: STUDIO.siret,
    email: STUDIO.email,
  })

  const sections = [
    { title: t('legal.termsAcceptanceTitle'), content: t('legal.termsAcceptance') },
    { title: t('legal.termsServiceTitle'), content: t('legal.termsService') },
    { title: t('legal.termsAccountTitle'), content: t('legal.termsAccount') },
    { title: t('legal.termsContentTitle'), content: t('legal.termsContent') },
    { title: t('legal.termsConductTitle'), content: t('legal.termsConduct') },
    { title: t('legal.termsSubscriptionTitle'), content: t('legal.termsSubscription') },
    { title: t('legal.termsWithdrawalTitle'), content: t('legal.termsWithdrawal') },
    { title: t('legal.termsCancellationTitle'), content: t('legal.termsCancellation') },
    { title: t('legal.termsModificationTitle'), content: t('legal.termsModification') },
    {
      title: t('legal.termsPublisherTitle'),
      content: (
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
          <p className="leading-relaxed text-muted-foreground break-words">{publisher}</p>
          <a
            href={STUDIO.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-neon-pink"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {t('legal.studioWebsite')} — {STUDIO.domain}
            <span className="sr-only"> {t('legal.opensInNewTab')}</span>
          </a>
        </div>
      ),
    },
  ]

  return (
    <LegalDocument
      icon={FileText}
      title={t('legal.termsTitle')}
      intro={t('legal.termsIntro')}
      lastUpdatedLabel={t('legal.termsLastUpdated')}
      idPrefix="terms"
      sections={sections}
    />
  )
}
