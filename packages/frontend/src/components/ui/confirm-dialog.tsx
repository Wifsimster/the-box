import type { ReactNode } from 'react'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from './responsive-dialog'
import { Button } from './button'
import { Loader2 } from 'lucide-react'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void | Promise<void>
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
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent data-testid={testId}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
          {description && <ResponsiveDialogDescription>{description}</ResponsiveDialogDescription>}
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
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
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
