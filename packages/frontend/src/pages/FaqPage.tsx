import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { HelpCircle } from 'lucide-react'

export default function FaqPage() {
  const { t } = useTranslation()

  const faqs = [
    { question: t('legal.faqQuestion1'), answer: t('legal.faqAnswer1') },
    { question: t('legal.faqQuestion2'), answer: t('legal.faqAnswer2') },
    { question: t('legal.faqQuestion3'), answer: t('legal.faqAnswer3') },
    { question: t('legal.faqQuestion4'), answer: t('legal.faqAnswer4') },
    { question: t('legal.faqQuestion5'), answer: t('legal.faqAnswer5') },
    { question: t('legal.faqQuestion6'), answer: t('legal.faqAnswer6') },
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
            <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-neon-cyan to-neon-pink shadow-lg shadow-neon-cyan/30">
              <HelpCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-linear-to-r from-neon-cyan to-neon-pink bg-clip-text text-transparent">
              {t('legal.faqTitle')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('legal.faqIntro')}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="space-y-2 border-b border-border pb-4 last:border-0"
              >
                <h2 className="text-lg font-semibold text-foreground">
                  {faq.question}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </p>
              </motion.div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
