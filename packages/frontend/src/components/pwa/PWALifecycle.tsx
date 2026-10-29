import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

export function PWALifecycle(): null {
  const { t, i18n } = useTranslation()
  const offlineToastShown = useRef(false)

  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW()

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
