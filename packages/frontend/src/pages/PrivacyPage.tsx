import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Shield } from 'lucide-react'

const emptySubscribe = () => () => {}
let cachedLastUpdated: string | null = null
const getLastUpdatedSnapshot = () => {
  if (cachedLastUpdated === null) {
    cachedLastUpdated = new Date().toLocaleDateString()
  }
  return cachedLastUpdated
}
const getLastUpdatedServerSnapshot = (): string | null => null

export default function PrivacyPage() {
  const { t } = useTranslation()
  const lastUpdated = useSyncExternalStore(
    emptySubscribe,
    getLastUpdatedSnapshot,
    getLastUpdatedServerSnapshot
  )

  const sections = [
    { title: t('legal.privacyCollectionTitle'), content: t('legal.privacyCollection') },
    { title: t('legal.privacyUsageTitle'), content: t('legal.privacyUsage') },
    { title: t('legal.privacyCookiesTitle'), content: t('legal.privacyCookies') },
    { title: t('legal.privacySecurityTitle'), content: t('legal.privacySecurity') },
    { title: t('legal.privacyPaymentsTitle'), content: t('legal.privacyPayments') },
    { title: t('legal.privacySubprocessorsTitle'), content: t('legal.privacySubprocessors') },
    { title: t('legal.privacyRetentionTitle'), content: t('legal.privacyRetention') },
    { title: t('legal.privacyRightsTitle'), content: t('legal.privacyRights') },
    { title: t('legal.privacyMinorsTitle'), content: t('legal.privacyMinors') },
    { title: t('legal.privacyContactTitle'), content: t('legal.privacyContact') },
  ]

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-card/50 border-border">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center size-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-neon-cyan to-neon-purple shadow-lg shadow-neon-cyan/30">
              <Shield className="size-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-linear-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent">
              {t('legal.privacyTitle')}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t('legal.privacyLastUpdated')}: {lastUpdated}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-center border-b border-border pb-6">
              {t('legal.privacyIntro')}
            </p>

            {sections.map((section, index) => (
              <m.div
                key={section.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="space-y-2"
              >
                <h2 className="text-lg font-semibold text-foreground">
                  {section.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {section.content}
                </p>
              </m.div>
            ))}
          </CardContent>
        </Card>
      </m.div>
    </div>
  )
}
