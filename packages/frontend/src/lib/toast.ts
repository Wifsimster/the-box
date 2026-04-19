/**
 * Toast API — thin shim over `sonner` preserving the pre-sprint-3 signature.
 *
 * Consumers call `toast.success('Saved!')` / `toast.error(...)` exactly as
 * before. The `<Toaster />` render tree now lives in `components/ui/sonner`
 * and is mounted once in `App.tsx`. There is no subscriber model anymore —
 * sonner owns the UI layer.
 */
import { toast as sonner } from "sonner"

export type ToastType = "success" | "error" | "warning" | "info"

export interface ToastOptions {
  duration?: number
}

const toId = (value: string | number): string => String(value)

export const toast = {
  success(message: string, duration?: number): string {
    return toId(sonner.success(message, { duration }))
  },
  error(message: string, duration?: number): string {
    return toId(sonner.error(message, { duration }))
  },
  warning(message: string, duration?: number): string {
    return toId(sonner.warning(message, { duration }))
  },
  info(message: string, duration?: number): string {
    return toId(sonner.info(message, { duration }))
  },
  show(message: string, type: ToastType = "info", duration = 5000): string {
    return toId(sonner[type](message, { duration }))
  },
}
