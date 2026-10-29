import { Toaster as SonnerToaster, type ToasterProps } from "sonner"

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      richColors
      closeButton
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
