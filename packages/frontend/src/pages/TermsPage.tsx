import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FileText } from 'lucide-react'

export default function TermsPage() {
  const { t } = useTranslation()

  const sections = [
    { title: t('legal.termsAcceptanceTitle'), content: t('legal.termsAcceptance') },
    { title: t('legal.termsServiceTitle'), content: t('legal.termsService') },
    { title: t('legal.termsAccountTitle'), content: t('legal.termsAccount') },
    { title: t('legal.termsContentTitle'), content: t('legal.termsContent') },
    { title: t('legal.termsConductTitle'), content: t('legal.termsConduct') },
    { title: t('legal.termsModificationTitle'), content: t('legal.termsModification') },
  ]

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-card/50 border-border">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
              {t('legal.termsTitle')}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t('legal.termsLastUpdated')}: {new Date().toLocaleDateString()}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-center border-b border-border pb-6">
              {t('legal.termsIntro')}
            </p>

            {sections.map((section, index) => (
              <motion.div
                key={index}
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
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
