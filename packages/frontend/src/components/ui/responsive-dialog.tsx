import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/useIsMobile"

const ResponsiveDialog = DialogPrimitive.Root

const ResponsiveDialogTrigger = DialogPrimitive.Trigger

const ResponsiveDialogPortal = DialogPrimitive.Portal

const ResponsiveDialogClose = DialogPrimitive.Close

function ResponsiveDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="responsive-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
}

type ResponsiveDialogContentProps = React.ComponentProps<
  typeof DialogPrimitive.Content
> & {
  /**
   * Hide the drag-handle affordance on the mobile bottom sheet.
   * Default: handle is shown so users see the sheet can be dismissed.
   */
  hideDragHandle?: boolean
}

function ResponsiveDialogContent({
  className,
  children,
  hideDragHandle,
  style,
  ...props
}: ResponsiveDialogContentProps) {
  const isMobile = useIsMobile()

  return (
    <ResponsiveDialogPortal>
      <ResponsiveDialogOverlay />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        data-slot="responsive-dialog-content"
        data-variant={isMobile ? "sheet" : "dialog"}
        style={isMobile ? style : { translate: "-50% -50%", ...style }}
        className={cn(
          isMobile
            ? "fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-lg motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:slide-in-from-bottom motion-safe:data-[state=closed]:slide-out-to-bottom motion-safe:data-[state=open]:duration-300 motion-safe:data-[state=closed]:duration-200"
            : "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto gap-3 sm:gap-4 rounded-lg border border-border bg-card p-4 sm:p-6 shadow-lg duration-200 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:slide-out-to-left-1/2 motion-safe:data-[state=closed]:slide-out-to-top-[48%] motion-safe:data-[state=open]:slide-in-from-left-1/2 motion-safe:data-[state=open]:slide-in-from-top-[48%]",
          className,
        )}
        {...props}
      >
        {isMobile && !hideDragHandle && (
          <div
            aria-hidden="true"
            className="mx-auto -mt-1 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-border/60"
          />
        )}
        {children}
        <DialogPrimitive.Close className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </ResponsiveDialogPortal>
  )
}

function ResponsiveDialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="responsive-dialog-header"
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  )
}

function ResponsiveDialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="responsive-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2",
        className,
      )}
      {...props}
    />
  )
}

function ResponsiveDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="responsive-dialog-title"
      className={cn(
        "text-base sm:text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  )
}

function ResponsiveDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="responsive-dialog-description"
      className={cn("text-sm sm:text-base text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  ResponsiveDialog,
  ResponsiveDialogPortal,
  ResponsiveDialogOverlay,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
}
