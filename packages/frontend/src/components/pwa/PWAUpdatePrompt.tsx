import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

export function PWAUpdatePrompt() {
  const { t } = useTranslation()
  const offlineToastShown = useRef(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

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
