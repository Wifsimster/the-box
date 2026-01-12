import * as React from "react"
import { cn } from "@/lib/utils"

interface PaginationDotsProps {
  total: number
  current: number
  onSelect: (index: number) => void
  maxVisible?: number
  className?: string
}

/**
 * Simple dot pagination for carousels and image galleries.
 * Dots are clickable to navigate directly to a specific item.
 */
function PaginationDots({
  total,
  current,
  onSelect,
  maxVisible = 10,
  className,
}: PaginationDotsProps) {
  // Don't render if only one item or exceeds max visible
  if (total <= 1 || total > maxVisible) {
    return null
  }

  return (
    <div className={cn("flex gap-1.5", className)}>
      {Array.from({ length: total }).map((_, index) => (
        <button
          key={index}
          type="button"
          className={cn(
            "w-2 h-2 rounded-full transition-colors",
            index === current
              ? "bg-primary"
              : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
          )}
          onClick={() => onSelect(index)}
          aria-label={`Go to item ${index + 1}`}
          aria-current={index === current ? "true" : undefined}
        />
      ))}
    </div>
  )
}

export { PaginationDots }
