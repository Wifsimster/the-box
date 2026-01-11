import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enTranslation from '../../public/locales/en/translation.json'
import frTranslation from '../../public/locales/fr/translation.json'

const resources = {
  en: {
    translation: enTranslation,
  },
  fr: {
    translation: frTranslation,
  },
}

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr'

export function getLanguageFromURL(): SupportedLanguage | null {
  const pathSegments = window.location.pathname.split('/')
  const langFromPath = pathSegments[1]
  if (SUPPORTED_LANGUAGES.includes(langFromPath as SupportedLanguage)) {
    return langFromPath as SupportedLanguage
  }
  return null
}

export function getBrowserLanguage(): SupportedLanguage {
  const browserLang = navigator.language.split('-')[0]
  if (SUPPORTED_LANGUAGES.includes(browserLang as SupportedLanguage)) {
    return browserLang as SupportedLanguage
  }
  return DEFAULT_LANGUAGE
}

export function getInitialLanguage(): SupportedLanguage {
  return getLanguageFromURL() || getBrowserLanguage()
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
