import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Button } from './button'
import { Loader2 } from 'lucide-react'

// Reusable confirmation dialog — drop-in replacement for window.confirm()
// when the action is destructive enough to warrant a styled prompt
// (revoke key, delete account, etc.). Built on top of the existing
// Dialog primitive so the visual treatment matches everything else
// in the settings page; the alternative was @radix-ui/react-alert-dialog
// which we don't depend on yet and don't need just for this one shape.

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
  // Marks the confirm action as destructive — flips the button to the
  // `destructive` variant. Use for revoke / delete flows.
  destructive?: boolean
  // Caller-controlled busy state. When true, the confirm button shows a
  // spinner and both buttons disable so a slow request can't be double-fired.
  busy?: boolean
  onConfirm: () => void | Promise<void>
  // Test hook so Playwright can target a specific dialog when multiple
  // ConfirmDialogs live on the same page.
  testId?: string
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  onConfirm,
  testId,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid={testId ? `${testId}-cancel` : undefined}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void onConfirm()}
            disabled={busy}
            data-testid={testId ? `${testId}-confirm` : undefined}
          >
            {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
