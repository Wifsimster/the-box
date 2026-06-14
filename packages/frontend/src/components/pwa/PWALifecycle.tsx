import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

/**
 * Headless PWA lifecycle bridge — renders no UI of its own.
 *
 * New builds activate and reload silently in the background
 * (`registerType: 'autoUpdate'`), so there is no "update available" prompt:
 * the {@link ChangelogDialog} is the single "what's new" surface, shown once
 * the freshly loaded bundle reports a newer version. This component only:
 *   - registers the service worker and announces offline-readiness once, and
 *   - mirrors the active i18n language down to the service worker so the push
 *     fallback notification matches the user's UI language.
 */
export function PWALifecycle(): null {
  const { t, i18n } = useTranslation()
  const offlineToastShown = useRef(false)

  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW()

  // Push the active i18n language down to the service worker so the push
  // fallback notification (shown when the server delivers a malformed or
  // empty payload) matches the user's UI language. Re-fired on language
  // switch so the SW always has the current value cached.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const send = (locale: string): void => {
      navigator.serviceWorker.controller?.postMessage({ type: 'SET_LOCALE', locale })
    }
    send(i18n.language)
    const onLangChange = (lang: string): void => send(lang)
    i18n.on('languageChanged', onLangChange)
    return () => {
      i18n.off('languageChanged', onLangChange)
    }
  }, [i18n])

  useEffect(() => {
    if (offlineReady && !offlineToastShown.current) {
      offlineToastShown.current = true
      toast.success(t('pwa.offlineReady'), {
        duration: 4000,
        onAutoClose: () => setOfflineReady(false),
        onDismiss: () => setOfflineReady(false),
      })
    }
  }, [offlineReady, setOfflineReady, t])

  return null
}
