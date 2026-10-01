import * as React from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()

  // Don't render if only one item or exceeds max visible
  if (total <= 1 || total > maxVisible) {
    return null
  }

  return (
    <div className={cn("flex", className)}>
      {Array.from({ length: total }).map((_, index) => (
        <button
          key={index}
          type="button"
          className="group flex size-6 items-center justify-center rounded-full"
          onClick={() => onSelect(index)}
          aria-label={t("common.goToItem", { index: index + 1 })}
          aria-current={index === current ? "true" : undefined}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full transition-colors",
              index === current
                ? "bg-primary"
                : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
            )}
          />
        </button>
      ))}
    </div>
  )
}

export { PaginationDots }
