import { Toaster as SonnerToaster, type ToasterProps } from "sonner"

/**
 * Themed sonner Toaster wired to our dark gaming palette via CSS vars.
 * Mount once in App.tsx; all toasts across the app (via `@/lib/toast` or
 * sonner's `toast` export) render through this instance.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      richColors
      closeButton
      // On phones sonner renders edge-to-edge from the top; without an offset
      // the stack lands on top of the sticky Header (h-14 + the iOS notch) and
      // covers its controls. Push it below the header and clear of the
      // safe-area so multiple stacked toasts stay tappable and readable.
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 4rem)', left: '0.75rem', right: '0.75rem' }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-success/30",
          error: "group-[.toaster]:border-error/30",
          warning: "group-[.toaster]:border-warning/30",
          info: "group-[.toaster]:border-neon-blue/30",
        },
      }}
      {...props}
    />
  )
}
