import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Seo } from './Seo'
import { SITE_NAME, SITE_URL, stripLangPrefix } from '@/lib/seo'

type RouteDef = {
  /** Match against the language-stripped path (e.g. `/play`, `/u/foo`). */
  match: (path: string) => null | Record<string, string>
  /** i18n key under `seo.*`. */
  key: string
  noindex?: boolean
  ogType?: 'website' | 'profile' | 'article'
  /** Build JSON-LD for this route. */
  jsonLd?: (lang: string) => Record<string, unknown> | Record<string, unknown>[] | undefined
}

const homeJsonLd = (lang: string): Record<string, unknown>[] => [
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: `${SITE_URL}/${lang}`,
    inLanguage: lang,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
    description:
      lang === 'fr'
        ? 'Devinez des jeux vidéo à partir de screenshots. Défi quotidien, classements en direct, succès.'
        : 'Guess video games from screenshots. Daily challenge, live leaderboards, achievements.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
  },
]

const breadcrumbLd = (lang: string, items: Array<{ name: string; path: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    name: item.name,
    item: `${SITE_URL}/${lang}${item.path}`,
  })),
})

function exact(suffix: string) {
  const re = new RegExp(`^${suffix.replace(/\//g, '\\/')}\\/?$`)
  return (path: string) => (re.test(path) ? {} : null)
}

function paramMatch(template: string, paramName: string) {
  const re = new RegExp(`^${template.replace(/:[a-z]+/gi, '([^/]+)').replace(/\//g, '\\/')}\\/?$`)
  return (path: string) => {
    const m = path.match(re)
    return m ? { [paramName]: m[1]! } : null
  }
}

const ROUTES: RouteDef[] = [
  {
    match: exact('/'),
    key: 'home',
    jsonLd: homeJsonLd,
  },
  { match: exact('/play'), key: 'play' },
  {
    match: exact('/leaderboard'),
    key: 'leaderboard',
    jsonLd: (lang) =>
      breadcrumbLd(lang, [
        { name: SITE_NAME, path: '' },
        { name: lang === 'fr' ? 'Classement' : 'Leaderboard', path: '/leaderboard' },
      ]),
  },
  { match: exact('/results'), key: 'results', noindex: true },
  { match: exact('/login'), key: 'login', noindex: true },
  { match: exact('/register'), key: 'register', noindex: true },
  { match: exact('/forgot-password'), key: 'forgotPassword', noindex: true },
  { match: exact('/reset-password'), key: 'resetPassword', noindex: true },
  { match: exact('/terms'), key: 'terms' },
  { match: exact('/privacy'), key: 'privacy' },
  { match: exact('/cookies'), key: 'cookies' },
  { match: exact('/faq'), key: 'faq' },
  { match: exact('/rules'), key: 'rules' },
  { match: exact('/contact'), key: 'contact' },
  { match: exact('/premium'), key: 'premium' },
  { match: exact('/abonnement'), key: 'premium' },
  { match: exact('/geo'), key: 'geo' },
  { match: exact('/geo/play'), key: 'geo' },
  { match: exact('/geo/contribute'), key: 'geoContribute' },
  { match: paramMatch('/u/:username', 'username'), key: 'publicProfile', ogType: 'profile' },
  // Private / volatile surfaces — we still want a sensible title but block indexing.
  { match: exact('/profile'), key: 'profile', noindex: true },
  { match: (p) => (p.startsWith('/history') ? {} : null), key: 'history', noindex: true },
  { match: (p) => (p.startsWith('/admin') ? {} : null), key: 'home', noindex: true },
]

export function RouteSeo() {
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()

  const suffix = stripLangPrefix(pathname) || '/'
  const matched = ROUTES.find((r) => r.match(suffix) !== null)
  if (!matched) {
    return (
      <Seo
        title={t('seo.home.title')}
        description={t('seo.home.description')}
        pathSuffix={suffix}
      />
    )
  }
  const params = matched.match(suffix) ?? {}
  const title = t(`seo.${matched.key}.title`, params)
  const description = t(`seo.${matched.key}.description`, params)
  const jsonLd = matched.jsonLd?.(i18n.language)

  return (
    <Seo
      title={title}
      description={description}
      pathSuffix={suffix}
      noindex={matched.noindex}
      ogType={matched.ogType}
      jsonLd={jsonLd}
    />
  )
}
