import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { toast as toastManager, type Toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/**
 * Toast Container Component
 *
 * WCAG compliant toast notification system with:
 * - Screen reader announcements (aria-live)
 * - Keyboard accessible dismiss
 * - Mobile responsive
 * - Memory leak prevention
 * - Toast deduplication
 *
 * Add this to your App.tsx or main layout component:
 * <ToastContainer />
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const recentMessagesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsubscribe = toastManager.subscribe((toast) => {
      // Deduplication: Check if same message shown recently (within 1 second)
      const messageKey = `${toast.type}:${toast.message}`
      if (recentMessagesRef.current.has(messageKey)) {
        return // Skip duplicate toast
      }

      // Mark message as recent
      recentMessagesRef.current.add(messageKey)
      setTimeout(() => {
        recentMessagesRef.current.delete(messageKey)
      }, 1000)

      setToasts((prev) => [...prev, toast])

      // Auto-remove after duration
      if (toast.duration) {
        const timeoutId = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id))
          timeoutsRef.current.delete(toast.id)
        }, toast.duration)

        timeoutsRef.current.set(toast.id, timeoutId)
      }
    })

    // Capture ref value for cleanup
    const timeouts = timeoutsRef.current

    // Cleanup: Clear all pending timeouts on unmount
    return () => {
      unsubscribe()
      timeouts.forEach((timeoutId) => clearTimeout(timeoutId))
      timeouts.clear()
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))

    // Clear associated timeout if exists
    const timeoutId = timeoutsRef.current.get(id)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutsRef.current.delete(id)
    }
  }

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)]"
    >
      <AnimatePresence mode="sync">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5" aria-hidden="true" />,
    error: <XCircle className="w-5 h-5" aria-hidden="true" />,
    warning: <AlertTriangle className="w-5 h-5" aria-hidden="true" />,
    info: <Info className="w-5 h-5" aria-hidden="true" />,
  }

  const styles = {
    success: 'bg-green-500/90 text-white border-green-600',
    error: 'bg-red-500/90 text-white border-red-600',
    warning: 'bg-yellow-500/90 text-white border-yellow-600',
    info: 'bg-blue-500/90 text-white border-blue-600',
  }

  const ariaLabels = {
    success: 'Success notification',
    error: 'Error notification',
    warning: 'Warning notification',
    info: 'Information notification',
  }

  return (
    <motion.div
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      aria-label={ariaLabels[toast.type]}
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm pointer-events-auto',
        'min-w-[280px] max-w-md w-full sm:w-auto',
        styles[toast.type]
      )}
    >
      <div className="flex-shrink-0">{icons[toast.type]}</div>
      <p className="flex-1 text-sm font-medium break-words">{toast.message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 hover:opacity-70 transition-opacity focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
        aria-label={`Dismiss ${toast.type} notification`}
        type="button"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </motion.div>
  )
}
