import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Check, Eye, Keyboard, Trophy, X, type LucideIcon } from 'lucide-react'
import { ContentPage } from '@/components/content/ContentPage'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useLocalizedPath } from '@/hooks/useLocalizedPath'

interface MatchExample {
  guess: string
  target: string
  whyKey: string
}

const ACCEPTED_EXAMPLES: MatchExample[] = [
  { guess: 'tomb raider', target: 'Tomb Raider', whyKey: 'legal.rulesMatchingAccept1Why' },
  { guess: 'plant vs zombies', target: 'Plants vs. Zombies', whyKey: 'legal.rulesMatchingAccept2Why' },
  { guess: 'total war rome', target: 'ROME: Total War', whyKey: 'legal.rulesMatchingAccept3Why' },
  { guess: 'Skyrim', target: 'The Elder Scrolls V: Skyrim', whyKey: 'legal.rulesMatchingAccept4Why' },
  { guess: 'cs go', target: 'Counter-Strike: Global Offensive', whyKey: 'legal.rulesMatchingAccept5Why' },
  { guess: 'witcher 3', target: 'The Witcher 3: Wild Hunt — Complete Edition', whyKey: 'legal.rulesMatchingAccept6Why' },
]

const REJECTED_EXAMPLES: MatchExample[] = [
  { guess: 'Fallout', target: 'Fallout 2', whyKey: 'legal.rulesMatchingReject1Why' },
  { guess: 'Witcher 2', target: 'The Witcher 3: Wild Hunt', whyKey: 'legal.rulesMatchingReject2Why' },
  { guess: 'Cuphead', target: 'Cuphead: The Delicious Last Course', whyKey: 'legal.rulesMatchingReject3Why' },
  { guess: 'A Space for the Unb', target: 'A Space for the Unbound', whyKey: 'legal.rulesMatchingReject4Why' },
  { guess: 'garage band', target: 'Xenoblade Chronicles 3D', whyKey: 'legal.rulesMatchingReject5Why' },
]

const STEPS: Array<{ icon: LucideIcon; titleKey: string; textKey: string }> = [
  { icon: Eye, titleKey: 'legal.rulesStep1Title', textKey: 'legal.rulesStep1' },
  { icon: Keyboard, titleKey: 'legal.rulesStep2Title', textKey: 'legal.rulesStep2' },
  { icon: Trophy, titleKey: 'legal.rulesStep3Title', textKey: 'legal.rulesStep3' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 border-b border-border pb-8 last:border-0 last:pb-0">
      <h2 id={id} className="text-lg font-semibold text-foreground sm:text-xl">
        {title}
      </h2>
      <div className="space-y-2 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function MatchExampleRow({ example, accepted }: { example: MatchExample; accepted: boolean }) {
  const { t } = useTranslation()
  const Icon = accepted ? Check : X
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <Icon
        className={`mt-1 size-4 shrink-0 ${accepted ? 'text-success' : 'text-error'}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sr-only">{t('legal.rulesMatchingExampleHeader')}: </span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground break-all">
            {example.guess}
          </code>
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{t('legal.rulesMatchingTargetHeader')}: </span>
          <span className="font-medium text-foreground break-words">{example.target}</span>
        </p>
        <p className="text-muted-foreground">{t(example.whyKey)}</p>
      </div>
    </li>
  )
}

function MatchExampleList({ accepted, examples }: { accepted: boolean; examples: MatchExample[] }) {
  const { t } = useTranslation()
  const Icon = accepted ? Check : X
  return (
    <div className="space-y-2">
      <h3
        className={`flex items-center gap-2 text-base font-semibold ${accepted ? 'text-success' : 'text-error'}`}
      >
        <Icon className="size-5" aria-hidden="true" />
        {t(accepted ? 'legal.rulesMatchingAcceptedTitle' : 'legal.rulesMatchingRejectedTitle')}
      </h3>
      <ul className="space-y-2">
        {examples.map((ex) => (
          <MatchExampleRow key={ex.guess + ex.target} example={ex} accepted={accepted} />
        ))}
      </ul>
    </div>
  )
}

export default function RulesPage() {
  const { t } = useTranslation()
  const { localizedPath } = useLocalizedPath()

  return (
    <ContentPage icon={BookOpen} title={t('legal.rulesTitle')} subtitle={t('legal.rulesIntro')}>
      <Card variant="neon">
        <CardHeader>
          <h2 className="text-lg font-semibold leading-none tracking-tight text-foreground">
            {t('game.rules.title')}
          </h2>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.titleKey} className="flex gap-3 sm:flex-col">
                <span className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <step.icon className="size-5" aria-hidden="true" />
                  <span className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                </span>
                <div className="min-w-0 space-y-0.5">
                  <p className="font-semibold text-foreground">{t(step.titleKey)}</p>
                  <p className="text-sm text-muted-foreground">{t(step.textKey)}</p>
                </div>
              </li>
            ))}
          </ol>
          <Button asChild variant="gaming" size="lg" className="w-full sm:w-auto">
            <Link to={localizedPath('/play')}>{t('nav.tabs.play')}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-8 pt-(--card-padding)">
          <Section id="rules-goal" title={t('legal.rulesGoalTitle')}>
            <p>{t('legal.rulesGoal')}</p>
          </Section>

          <Section id="rules-daily" title={t('legal.rulesChallengeTitle')}>
            <p>{t('legal.rulesChallenge')}</p>
            <h3 className="pt-2 text-base font-semibold text-foreground">
              {t('legal.rulesCatchupTitle')}
            </h3>
            <p>{t('legal.rulesCatchup')}</p>
          </Section>

          <Section id="rules-scoring" title={t('legal.rulesScoringTitle')}>
            <ul className="list-disc space-y-1.5 pl-5 marker:text-primary">
              <li>{t('legal.rulesScoringBase')}</li>
              <li>{t('legal.rulesScoringSpeed')}</li>
              <li>{t('legal.rulesScoringTries')}</li>
              <li>{t('legal.rulesScoringHints')}</li>
              <li>{t('legal.rulesScoringSkip')}</li>
            </ul>
          </Section>

          <Section id="rules-hints" title={t('legal.rulesHintsTitle')}>
            <p>{t('legal.rulesHints')}</p>
          </Section>

          <Section id="rules-matching" title={t('legal.rulesMatchingTitle')}>
            <p>{t('legal.rulesMatchingIntro')}</p>
            <p
              className="flex flex-wrap items-center gap-x-2 pt-2 text-xs font-medium uppercase tracking-wide"
              aria-hidden="true"
            >
              <span>{t('legal.rulesMatchingExampleHeader')}</span>
              <ArrowRight className="size-3.5" />
              <span>{t('legal.rulesMatchingTargetHeader')}</span>
            </p>
            <div className="space-y-6 pt-1">
              <MatchExampleList accepted examples={ACCEPTED_EXAMPLES} />
              <MatchExampleList accepted={false} examples={REJECTED_EXAMPLES} />
            </div>
          </Section>

          <Section id="rules-geo" title={t('legal.rulesGeoTitle')}>
            <p>{t('legal.rulesGeoIntro')}</p>
            <p>{t('legal.rulesGeoScoring')}</p>
          </Section>

          <Section id="rules-premium" title={t('legal.rulesPremiumTitle')}>
            <p>{t('legal.rulesPremium')}</p>
          </Section>

          <Section id="rules-referral" title={t('legal.rulesReferralTitle')}>
            <p>{t('legal.rulesReferral')}</p>
          </Section>

          <Section id="rules-leaderboard" title={t('legal.rulesLeaderboardTitle')}>
            <p>{t('legal.rulesLeaderboard')}</p>
          </Section>

          <Section id="rules-fair-play" title={t('legal.rulesFairPlayTitle')}>
            <p>{t('legal.rulesFairPlay')}</p>
          </Section>
        </CardContent>
      </Card>
    </ContentPage>
  )
}
