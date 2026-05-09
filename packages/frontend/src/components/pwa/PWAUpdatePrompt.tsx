import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

export function PWAUpdatePrompt() {
  const { t, i18n } = useTranslation()
  const offlineToastShown = useRef(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
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

  useEffect(() => {
    if (!needRefresh) return
    const id = toast.info(t('pwa.updateAvailable'), {
      duration: Infinity,
      action: {
        label: t('pwa.refresh'),
        onClick: () => {
          void updateServiceWorker(true)
        },
      },
      onDismiss: () => setNeedRefresh(false),
    })
    return () => {
      toast.dismiss(id)
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker, t])

  return null
}
