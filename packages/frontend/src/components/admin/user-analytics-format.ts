// Number/percent formatters for the user-analytics admin views. Kept in a
// dedicated module (not the component file) so the components file only exports
// components — required for Fast Refresh and react-doctor only-export-components.

// Intl.NumberFormat loads locale-data tables on construction, so the formatters
// live at module scope (built once) rather than being recreated on every call /
// list item. The app ships exactly fr + en; unknown locales fall back to fr.
const INTEGER_FORMATTERS: Record<string, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr'),
  en: new Intl.NumberFormat('en'),
}

const PERCENT_FORMATTERS: Record<string, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr', { maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat('en', { maximumFractionDigits: 1 }),
}

const localeKey = (lang: string): 'fr' | 'en' => (lang.startsWith('en') ? 'en' : 'fr')

export const numberFormat = (n: number, lang: string) =>
  INTEGER_FORMATTERS[localeKey(lang)].format(n)

export const percentFormat = (n: number, lang: string) =>
  `${PERCENT_FORMATTERS[localeKey(lang)].format(n)}%`

export const formatDateTime = (iso: string | null, lang: string, fallback: string) => {
  if (!iso) return fallback
  return new Date(iso).toLocaleString(lang, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export const formatRelative = (iso: string | null, lang: string, fallback: string) => {
  if (!iso) return fallback
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return formatDateTime(iso, lang, fallback)
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h`
  const days = Math.round(hours / 24)
  return `${days} j`
}
