import * as React from "react"
import { cn } from "@/lib/utils"

type AlertTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  ref?: React.Ref<HTMLParagraphElement>
}

const AlertTitle = ({ className, children, ref, ...props }: AlertTitleProps) => (
  <h5
    ref={ref}
    data-slot="alert-title"
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  >
    {children}
  </h5>
)
AlertTitle.displayName = "AlertTitle"

export { AlertTitle }
