import * as React from "react"
import { cn } from "@/lib/utils"

type AlertDescriptionProps = React.HTMLAttributes<HTMLParagraphElement> & {
  ref?: React.Ref<HTMLParagraphElement>
}

const AlertDescription = ({ className, ref, ...props }: AlertDescriptionProps) => (
  <div
    ref={ref}
    data-slot="alert-description"
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
)
AlertDescription.displayName = "AlertDescription"

export { AlertDescription }
