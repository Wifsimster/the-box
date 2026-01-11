import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  className?: string
  contentClassName?: string
}

export function Tooltip({ content, children, side = "top", className, contentClassName }: TooltipProps) {
  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }

  const isSimpleContent = typeof content === "string"

  return (
    <div className={cn("relative group inline-flex", className)}>
      {children}
      <div
        className={cn(
          "absolute z-50 px-2 py-1 text-xs font-medium text-white bg-card border border-border rounded shadow-lg",
          "opacity-0 invisible group-hover:opacity-100 group-hover:visible",
          "transition-all duration-200 pointer-events-none",
          isSimpleContent && "whitespace-nowrap",
          sideClasses[side],
          contentClassName
        )}
      >
        {content}
      </div>
    </div>
  )
}
