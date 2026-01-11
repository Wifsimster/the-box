import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Mail, MessageSquare, Bug, Clock, ExternalLink } from 'lucide-react'

export default function ContactPage() {
  const { t } = useTranslation()

  const contactMethods = [
    {
      icon: Mail,
      title: t('legal.contactEmailTitle'),
      content: t('legal.contactEmail'),
      isEmail: true,
    },
    {
      icon: MessageSquare,
      title: t('legal.contactSocialTitle'),
      content: t('legal.contactSocial'),
    },
    {
      icon: Bug,
      title: t('legal.contactBugTitle'),
      content: t('legal.contactBug'),
      link: 'https://github.com/Wifsimster/the-box/issues',
      linkLabel: 'GitHub Issues',
    },
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
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-linear-to-r from-neon-pink to-neon-purple bg-clip-text text-transparent">
              {t('legal.contactTitle')}
            </h1>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground text-center border-b border-border pb-6">
              {t('legal.contactIntro')}
            </p>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {contactMethods.map((method, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="p-4 rounded-lg bg-card border border-border hover:border-neon-purple/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-neon-purple/20 flex items-center justify-center">
                      <method.icon className="w-5 h-5 text-neon-purple" />
                    </div>
                    <h3 className="font-semibold text-foreground">
                      {method.title}
                    </h3>
                  </div>
                  {method.isEmail ? (
                    <a
                      href={`mailto:${method.content}`}
                      className="text-neon-purple hover:text-neon-pink transition-colors"
                    >
                      {method.content}
                    </a>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {method.content}
                      </p>
                      {method.link && (
                        <a
                          href={method.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-neon-purple hover:text-neon-pink transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {method.linkLabel}
                        </a>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 pt-4 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{t('legal.contactResponseTime')}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
