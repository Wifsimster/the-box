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

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('language') || 'fr', // Default to French
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
