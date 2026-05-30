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
