import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ListOrdered, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'
import { ContentPage } from './ContentPage'

const emptySubscribe = () => () => {}
let cachedLastUpdated: string | null = null
const getLastUpdatedSnapshot = () => {
  if (cachedLastUpdated === null) {
    cachedLastUpdated = new Date().toLocaleDateString()
  }
  return cachedLastUpdated
}
const getLastUpdatedServerSnapshot = (): string | null => null

export interface LegalSection {
  title: string
  content: React.ReactNode
}

interface LegalDocumentProps {
  icon: LucideIcon
  title: string
  intro: string
  lastUpdatedLabel: string
  /** Prefix for the section anchors, e.g. `privacy` → `#privacy-3`. */
  idPrefix: string
  sections: LegalSection[]
}

export function LegalDocument({
  icon,
  title,
  intro,
  lastUpdatedLabel,
  idPrefix,
  sections,
}: LegalDocumentProps) {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()
  const [tocOpen, setTocOpen] = useState(false)
  const lastUpdated = useSyncExternalStore(
    emptySubscribe,
    getLastUpdatedSnapshot,
    getLastUpdatedServerSnapshot
  )

  return (
    <ContentPage icon={icon} title={title} subtitle={intro}>
      <p className="text-center text-sm text-muted-foreground">
        {lastUpdatedLabel}: {lastUpdated}
      </p>

      <Card>
        <Collapsible open={tocOpen} onOpenChange={setTocOpen}>
          <CollapsibleTrigger
            className="group flex min-h-14 w-full items-center gap-3 rounded-xl px-(--card-padding) text-left font-semibold text-foreground"
          >
            <ListOrdered className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1">{t('legal.tocTitle')}</span>
            <ChevronDown
              className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <nav aria-label={t('legal.tocTitle')} className="px-(--card-padding) pb-3">
              <ul className="border-t border-border pt-2">
                {sections.map((section, index) => (
                  <li key={section.title}>
                    <a
                      href={`#${idPrefix}-${index + 1}`}
                      onClick={() => setTocOpen(false)}
                      className="flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card>
        <CardContent className="space-y-8 pt-(--card-padding)">
          {sections.map((section, index) => {
            const id = `${idPrefix}-${index + 1}`
            return (
              <section key={section.title} aria-labelledby={id} className="space-y-2">
                <h2 id={id} className="text-lg font-semibold text-foreground sm:text-xl">
                  {section.title}
                </h2>
                {typeof section.content === 'string' ? (
                  <p className="leading-relaxed text-muted-foreground break-words">
                    {section.content}
                  </p>
                ) : (
                  section.content
                )}
              </section>
            )
          })}
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{t('legal.docQuestion')}</p>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
          <Link to={localizedPath('/contact')}>{t('legal.contactTitle')}</Link>
        </Button>
      </div>
    </ContentPage>
  )
}
