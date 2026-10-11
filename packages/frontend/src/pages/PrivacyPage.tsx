import { useTranslation } from 'react-i18next'
import { Shield } from 'lucide-react'
import { LegalDocument } from '@/components/content/LegalDocument'
import { useFeatures } from '@/hooks/useFeatures'

export default function PrivacyPage() {
  const { t } = useTranslation()
  const { describeGuess } = useFeatures()

  const sections = [
    { title: t('legal.privacyCollectionTitle'), content: t('legal.privacyCollection') },
    { title: t('legal.privacyUsageTitle'), content: t('legal.privacyUsage') },
    { title: t('legal.privacyCookiesTitle'), content: t('legal.privacyCookies') },
    { title: t('legal.privacySecurityTitle'), content: t('legal.privacySecurity') },
    { title: t('legal.privacyPaymentsTitle'), content: t('legal.privacyPayments') },
    { title: t('legal.privacySubprocessorsTitle'), content: t('legal.privacySubprocessors') },
    // Listed only while "describe the game" is live: the policy must not
    // describe processing that doesn't happen. Wording pending legal review.
    ...(describeGuess
      ? [{ title: t('legal.privacyDescribeGuessTitle'), content: t('legal.privacyDescribeGuess') }]
      : []),
    { title: t('legal.privacyRetentionTitle'), content: t('legal.privacyRetention') },
    { title: t('legal.privacyRightsTitle'), content: t('legal.privacyRights') },
    { title: t('legal.privacyMinorsTitle'), content: t('legal.privacyMinors') },
    { title: t('legal.privacyContactTitle'), content: t('legal.privacyContact') },
  ]

  return (
    <LegalDocument
      icon={Shield}
      title={t('legal.privacyTitle')}
      intro={t('legal.privacyIntro')}
      lastUpdatedLabel={t('legal.privacyLastUpdated')}
      idPrefix="privacy"
      sections={sections}
    />
  )
}
