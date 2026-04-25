import i18n from './i18n'
import { ApiError } from './errors'

type WithCode = { code?: string | null }
type WithMessage = { message?: string | null }

export function getApiErrorTranslationKey(code?: string | null): string {
  if (!code) return 'apiErrors.default'
  // Only map to the namespaced key if it's a known code; otherwise fall back to default
  const exists = i18n.exists(`apiErrors.${code}`)
  return exists ? `apiErrors.${code}` : 'apiErrors.default'
}

export function getApiErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError) {
    if (error.code) {
      const key = getApiErrorTranslationKey(error.code)
      if (key !== 'apiErrors.default') return i18n.t(key)
    }
    if (error.message) return error.message
  }

  if (error && typeof error === 'object') {
    const e = error as WithCode & WithMessage
    if (e.code) {
      const key = getApiErrorTranslationKey(e.code)
      if (key !== 'apiErrors.default') return i18n.t(key)
    }
    if (typeof e.message === 'string' && e.message) return e.message
  }

  if (typeof error === 'string' && error) return error

  return fallback ?? i18n.t('apiErrors.default')
}
