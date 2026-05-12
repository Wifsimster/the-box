import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_OG_IMAGE,
  LOCALE_BY_LANG,
  SITE_NAME,
  SITE_URL,
  buildHreflangAlternates,
  buildLocalizedUrl,
  stripLangPrefix,
} from '@/lib/seo'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n'

type SeoProps = {
  title: string
  description: string
  /**
   * Path suffix without the language prefix (e.g. `/leaderboard`). Defaults to
   * the current location's suffix so canonical and hreflang stay in sync.
   */
  pathSuffix?: string
  image?: string
  /** Discourage indexing (used for auth flows, admin, history detail, results). */
  noindex?: boolean
  /** Structured data (Schema.org). Rendered as a JSON-LD `<script>`. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  ogType?: 'website' | 'article' | 'profile'
}

// Marker attribute so we only remove tags this component owns on cleanup.
const MARKER = 'data-seo'

function upsertMeta(selector: string, attrs: Record<string, string>): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(MARKER, 'managed')
    document.head.appendChild(el)
  }
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v)
  }
  return el
}

function clearManaged(name: string) {
  document.head.querySelectorAll(`[${MARKER}="${name}"]`).forEach((el) => el.remove())
}

export function Seo({
  title,
  description,
  pathSuffix,
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  jsonLd,
  ogType = 'website',
}: SeoProps) {
  const location = useLocation()
  const { i18n } = useTranslation()

  useEffect(() => {
    const lang = (SUPPORTED_LANGUAGES.includes(i18n.language as SupportedLanguage)
      ? i18n.language
      : 'fr') as SupportedLanguage
    const suffix = pathSuffix ?? stripLangPrefix(location.pathname)
    const canonical = buildLocalizedUrl(lang, suffix)

    document.title = title

    upsertMeta('meta[name="description"]', { name: 'description', content: description })

    // Canonical
    let canonicalEl = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonicalEl) {
      canonicalEl = document.createElement('link')
      canonicalEl.setAttribute('rel', 'canonical')
      document.head.appendChild(canonicalEl)
    }
    canonicalEl.setAttribute('href', canonical)

    // hreflang alternates (always managed by this component).
    clearManaged('hreflang')
    for (const alt of buildHreflangAlternates(suffix)) {
      const link = document.createElement('link')
      link.setAttribute('rel', 'alternate')
      link.setAttribute('hreflang', alt.hreflang)
      link.setAttribute('href', alt.href)
      link.setAttribute(MARKER, 'hreflang')
      document.head.appendChild(link)
    }

    // Open Graph + Twitter
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: ogType })
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
    upsertMeta('meta[property="og:image"]', {
      property: 'og:image',
      content: image.startsWith('http') ? image : `${SITE_URL}${image}`,
    })
    upsertMeta('meta[property="og:locale"]', {
      property: 'og:locale',
      content: LOCALE_BY_LANG[lang],
    })

    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    upsertMeta('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: image.startsWith('http') ? image : `${SITE_URL}${image}`,
    })

    // robots
    if (noindex) {
      upsertMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, nofollow' })
    } else {
      const existing = document.head.querySelector('meta[name="robots"]')
      if (existing) existing.remove()
    }

    // JSON-LD
    clearManaged('jsonld')
    if (jsonLd) {
      const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
      for (const item of items) {
        const script = document.createElement('script')
        script.setAttribute('type', 'application/ld+json')
        script.setAttribute(MARKER, 'jsonld')
        script.text = JSON.stringify(item)
        document.head.appendChild(script)
      }
    }

    return () => {
      // Only the per-page extras get cleaned; canonical/og stay set so the next
      // page can overwrite them without a missing-tag flash.
      clearManaged('hreflang')
      clearManaged('jsonld')
    }
  }, [title, description, pathSuffix, image, noindex, jsonLd, ogType, location.pathname, i18n.language])

  return null
}
