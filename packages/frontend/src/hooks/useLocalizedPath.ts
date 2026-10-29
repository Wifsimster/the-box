import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function useLocalizedPath() {
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()

  const currentLang = lang || i18n.language

  const localizedPath = (path: string) => {
    if (path.startsWith(`/${currentLang}`)) {
      return path
    }
    if (path === '/') {
      return `/${currentLang}`
    }
    return `/${currentLang}${path.startsWith('/') ? path : `/${path}`}`
  }

  return { currentLang, localizedPath }
}
