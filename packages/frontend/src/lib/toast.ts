/**
 * Simple toast notification utility
 *
 * This is a minimal implementation. For production, consider using:
 * - sonner (recommended)
 * - react-hot-toast
 * - react-toastify
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

type ToastListener = (toast: Toast) => void

class ToastManager {
  private listeners: Set<ToastListener> = new Set()
  private nextId = 0

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(toast: Toast): void {
    this.listeners.forEach((listener) => listener(toast))
  }

  show(message: string, type: ToastType = 'info', duration = 5000): string {
    const id = `toast-${this.nextId++}`
    const toast: Toast = { id, message, type, duration }
    this.notify(toast)
    return id
  }

  success(message: string, duration?: number): string {
    return this.show(message, 'success', duration)
  }

  error(message: string, duration?: number): string {
    return this.show(message, 'error', duration)
  }

  warning(message: string, duration?: number): string {
    return this.show(message, 'warning', duration)
  }

  info(message: string, duration?: number): string {
    return this.show(message, 'info', duration)
  }
}

// Singleton instance
export const toast = new ToastManager()
