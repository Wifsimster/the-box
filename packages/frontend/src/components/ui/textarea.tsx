import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Same 16px-on-mobile rule as Input to avoid iOS zoom-on-focus.
        "flex min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-base md:text-sm text-foreground",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors duration-200",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
