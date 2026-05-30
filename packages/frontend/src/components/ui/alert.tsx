import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { AlertTitle } from "./alert-title"
import { AlertDescription } from "./alert-description"

const alertVariants = cva(
  "relative w-full rounded-lg border px-3 py-2 text-sm [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive [&>svg]:text-destructive",
        warning:
          "border-warning/30 bg-warning/10 text-warning [&>svg]:text-warning",
        success:
          "border-success/30 bg-success/10 text-success [&>svg]:text-success",
        info:
          "border-neon-blue/30 bg-neon-blue/10 text-neon-blue [&>svg]:text-neon-blue",
        neon:
          "border-neon-pink/30 bg-linear-to-r from-neon-pink/10 via-neon-purple/10 to-transparent text-foreground [&>svg]:text-neon-pink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    ref?: React.Ref<HTMLDivElement>
  }

const Alert = ({ className, variant, ref, ...props }: AlertProps) => (
  <div
    ref={ref}
    data-slot="alert"
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
)
Alert.displayName = "Alert"

export { Alert, AlertTitle, AlertDescription }
