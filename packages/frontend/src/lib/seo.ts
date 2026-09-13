import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './i18n'

// Brand strings live in ./brand (no imports, so a Node test can read them).
// Re-exported here because this module is the established import site for
// site-level constants. See docs/brand.md.
export { SITE_NAME, SITE_TAGLINE, SITE_CATEGORY, type BrandLang } from './brand'

export const SITE_URL = 'https://the-box.battistella.ovh'
export const DEFAULT_OG_IMAGE = `${SITE_URL}/api/og/daily.svg`

export const LOCALE_BY_LANG: Record<SupportedLanguage, string> = {
  fr: 'fr_FR',
  en: 'en_US',
}

export function stripLangPrefix(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length > 0 && SUPPORTED_LANGUAGES.includes(segments[0] as SupportedLanguage)) {
    return '/' + segments.slice(1).join('/')
  }
  return pathname
}

export function buildLocalizedUrl(lang: SupportedLanguage, suffixPath: string): string {
  const clean = suffixPath.replace(/^\/+/, '')
  return clean ? `${SITE_URL}/${lang}/${clean}` : `${SITE_URL}/${lang}`
}

export type HreflangAlternate = {
  hreflang: string
  href: string
}

export function buildHreflangAlternates(suffixPath: string): HreflangAlternate[] {
  const alternates: HreflangAlternate[] = SUPPORTED_LANGUAGES.map((lang) => ({
    hreflang: lang,
    href: buildLocalizedUrl(lang, suffixPath),
  }))
  alternates.push({ hreflang: 'x-default', href: buildLocalizedUrl('fr', suffixPath) })
  return alternates
}
