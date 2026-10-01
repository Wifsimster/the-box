import { useTranslation } from 'react-i18next'
import { Cookie } from 'lucide-react'
import { LegalDocument } from '@/components/content/LegalDocument'

export default function CookiesPage() {
  const { t } = useTranslation()

  const sections = [
    { title: t('legal.cookiesWhatTitle'), content: t('legal.cookiesWhat') },
    { title: t('legal.cookiesTypesTitle'), content: t('legal.cookiesTypes') },
    { title: t('legal.cookiesEssentialTitle'), content: t('legal.cookiesEssential') },
    { title: t('legal.cookiesManageTitle'), content: t('legal.cookiesManage') },
    { title: t('legal.cookiesConsentTitle'), content: t('legal.cookiesConsent') },
    { title: t('legal.cookiesChangesTitle'), content: t('legal.cookiesChanges') },
  ]

  return (
    <LegalDocument
      icon={Cookie}
      title={t('legal.cookiesTitle')}
      intro={t('legal.cookiesIntro')}
      lastUpdatedLabel={t('legal.cookiesLastUpdated')}
      idPrefix="cookies"
      sections={sections}
    />
  )
}
