import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function useLocalizedPath() {
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()

  const currentLang = lang || i18n.language

  const localizedPath = (path: string) => {
    // If path already starts with language prefix, return as-is
    if (path.startsWith(`/${currentLang}`)) {
      return path
    }
    // Handle root path
    if (path === '/') {
      return `/${currentLang}`
    }
    // Add language prefix
    return `/${currentLang}${path.startsWith('/') ? path : `/${path}`}`
  }

  return { currentLang, localizedPath }
}
