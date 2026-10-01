import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ChevronDown, HelpCircle } from 'lucide-react'
import { ContentPage } from '@/components/content/ContentPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { STUDIO } from '@/lib/studio'

interface Faq {
  id: string
  question: string
  answer: string
  link?: { to: string; label: string }
}

export default function FaqPage() {
  const { t } = useTranslation()
  const { hash } = useLocation()
  const { localizedPath } = useLocalizedPath()
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const faqs: Faq[] = [
    { id: 'faq-1', question: t('legal.faqQuestion1'), answer: t('legal.faqAnswer1') },
    {
      id: 'faq-2',
      question: t('legal.faqQuestion2'),
      answer: t('legal.faqAnswer2'),
      link: { to: localizedPath('/rules'), label: t('footer.rules') },
    },
    { id: 'faq-3', question: t('legal.faqQuestion3'), answer: t('legal.faqAnswer3') },
    {
      id: 'faq-4',
      question: t('legal.faqQuestion4'),
      answer: t('legal.faqAnswer4'),
      link: { to: `${localizedPath('/rules')}#rules-scoring`, label: t('legal.faqScoringLink') },
    },
    { id: 'faq-5', question: t('legal.faqQuestion5'), answer: t('legal.faqAnswer5') },
    {
      id: 'faq-6',
      question: t('legal.faqQuestion6'),
      answer: t('legal.faqAnswer6'),
      link: { to: localizedPath('/contact'), label: t('legal.contactTitle') },
    },
    {
      id: 'faq-7',
      question: t('legal.faqQuestion7'),
      answer: t('legal.faqAnswer7', {
        studio: STUDIO.name,
        founder: STUDIO.founder,
        domain: STUDIO.domain,
      }),
    },
  ]

  const isOpen = (id: string) => toggled[id] ?? hash === `#${id}`

  return (
    <ContentPage icon={HelpCircle} title={t('legal.faqTitle')} subtitle={t('legal.faqIntro')}>
      <Card>
        <CardContent className="divide-y divide-border py-1 sm:py-2">
          {faqs.map((faq) => (
            <Collapsible
              key={faq.id}
              id={faq.id}
              open={isOpen(faq.id)}
              onOpenChange={(open) => setToggled((prev) => ({ ...prev, [faq.id]: open }))}
            >
              <h2 className="text-base font-semibold text-foreground sm:text-lg">
                <CollapsibleTrigger className="group flex min-h-14 w-full items-center gap-3 rounded-md py-3 text-left">
                  <span className="flex-1">{faq.question}</span>
                  <ChevronDown
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
              </h2>
              <CollapsibleContent className="space-y-1 pb-4">
                <p className="leading-relaxed text-muted-foreground">{faq.answer}</p>
                {faq.link && (
                  <Link
                    to={faq.link.to}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-neon-pink"
                  >
                    {faq.link.label}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t('legal.faqStillQuestions')}</p>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link to={localizedPath('/contact')}>{t('legal.contactTitle')}</Link>
        </Button>
      </div>
    </ContentPage>
  )
}
