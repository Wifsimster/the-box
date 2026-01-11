import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Cookie } from 'lucide-react'

export default function CookiesPage() {
  const { t } = useTranslation()

  const sections = [
    { title: t('legal.cookiesWhatTitle'), content: t('legal.cookiesWhat') },
    { title: t('legal.cookiesTypesTitle'), content: t('legal.cookiesTypes') },
    { title: t('legal.cookiesEssentialTitle'), content: t('legal.cookiesEssential') },
    { title: t('legal.cookiesManageTitle'), content: t('legal.cookiesManage') },
    { title: t('legal.cookiesChangesTitle'), content: t('legal.cookiesChanges') },
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
            <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-neon-pink to-neon-purple shadow-lg shadow-neon-pink/30">
              <Cookie className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-linear-to-r from-neon-pink to-neon-purple bg-clip-text text-transparent">
              {t('legal.cookiesTitle')}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t('legal.cookiesLastUpdated')}: {new Date().toLocaleDateString()}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-center border-b border-border pb-6">
              {t('legal.cookiesIntro')}
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
