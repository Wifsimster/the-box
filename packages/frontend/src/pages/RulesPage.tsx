import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { BookOpen, Check, X } from 'lucide-react'

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

function Section({
  title,
  children,
  delay = 0,
}: {
  title: string
  children: React.ReactNode
  delay?: number
}) {
  return (
    <motion.section
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="space-y-3 border-b border-border pb-6 last:border-0"
    >
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </motion.section>
  )
}

function MatchExampleRow({ example, accepted }: { example: MatchExample; accepted: boolean }) {
  const { t } = useTranslation()
  const Icon = accepted ? Check : X
  const iconClasses = accepted ? 'text-success' : 'text-error'
  return (
    <li className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${iconClasses}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <span className="font-medium text-muted-foreground">
              {t('legal.rulesMatchingExampleHeader')}:
            </span>
            <code className="font-mono text-foreground break-words">{example.guess}</code>
            <span className="font-medium text-muted-foreground">
              {t('legal.rulesMatchingTargetHeader')}:
            </span>
            <code className="font-mono text-foreground break-words">{example.target}</code>
          </div>
          <p className="text-sm text-muted-foreground">{t(example.whyKey)}</p>
        </div>
      </div>
    </li>
  )
}

export default function RulesPage() {
  const { t } = useTranslation()

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-card/50 border-border">
          <CardHeader className="text-center">
            <div className="inline-flex items-center justify-center size-16 mx-auto mb-4 rounded-xl bg-linear-to-br from-neon-purple to-neon-pink shadow-lg shadow-neon-purple/30">
              <BookOpen className="size-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-linear-to-r from-neon-purple to-neon-pink bg-clip-text text-transparent">
              {t('legal.rulesTitle')}
            </h1>
            <p className="text-muted-foreground mt-2">{t('legal.rulesIntro')}</p>
          </CardHeader>

          <CardContent className="space-y-6">
            <Section title={t('legal.rulesGoalTitle')} delay={0.05}>
              <p>{t('legal.rulesGoal')}</p>
            </Section>

            <Section title={t('legal.rulesChallengeTitle')} delay={0.1}>
              <p>{t('legal.rulesChallenge')}</p>
              <div>
                <h3 className="text-base font-semibold text-foreground mt-2">
                  {t('legal.rulesCatchupTitle')}
                </h3>
                <p>{t('legal.rulesCatchup')}</p>
              </div>
            </Section>

            <Section title={t('legal.rulesScoringTitle')} delay={0.15}>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>{t('legal.rulesScoringBase')}</li>
                <li>{t('legal.rulesScoringSpeed')}</li>
                <li>{t('legal.rulesScoringTries')}</li>
                <li>{t('legal.rulesScoringHints')}</li>
                <li>{t('legal.rulesScoringSkip')}</li>
              </ul>
            </Section>

            <Section title={t('legal.rulesHintsTitle')} delay={0.2}>
              <p>{t('legal.rulesHints')}</p>
            </Section>

            <Section title={t('legal.rulesMatchingTitle')} delay={0.25}>
              <p>{t('legal.rulesMatchingIntro')}</p>

              <div className="grid gap-6 md:grid-cols-2 mt-4">
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-success">
                    <Check className="size-5" aria-hidden="true" />
                    {t('legal.rulesMatchingAcceptedTitle')}
                  </h3>
                  <ul className="space-y-2">
                    {ACCEPTED_EXAMPLES.map((ex) => (
                      <MatchExampleRow key={ex.guess + ex.target} example={ex} accepted />
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-error">
                    <X className="size-5" aria-hidden="true" />
                    {t('legal.rulesMatchingRejectedTitle')}
                  </h3>
                  <ul className="space-y-2">
                    {REJECTED_EXAMPLES.map((ex) => (
                      <MatchExampleRow key={ex.guess + ex.target} example={ex} accepted={false} />
                    ))}
                  </ul>
                </div>
              </div>
            </Section>

            <Section title={t('legal.rulesLeaderboardTitle')} delay={0.3}>
              <p>{t('legal.rulesLeaderboard')}</p>
            </Section>

            <Section title={t('legal.rulesFairPlayTitle')} delay={0.35}>
              <p>{t('legal.rulesFairPlay')}</p>
            </Section>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
