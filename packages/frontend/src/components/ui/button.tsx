import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]",
        destructive:
          "bg-error text-white shadow-sm hover:bg-error/90 hover:scale-[1.02] active:scale-[0.98]",
        outline:
          "border border-border bg-transparent hover:bg-muted hover:text-foreground hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:scale-[1.02] active:scale-[0.98]",
        ghost:
          "hover:bg-muted hover:text-foreground active:scale-[0.98]",
        link:
          "text-primary underline-offset-4 hover:underline",
        gaming:
          "bg-linear-to-r from-neon-purple to-neon-pink text-white shadow-lg hover:shadow-[var(--glow-lg)] hover:scale-[1.03] active:scale-[0.98]",
        warning:
          "text-warning bg-warning/10 border border-warning/30 hover:bg-warning/20 hover:scale-[1.02] active:scale-[0.98]",
        hintUsed:
          "border border-warning bg-warning/20 text-warning hover:bg-warning/30 hover:scale-[1.02] active:scale-[0.98]",
        hintFree:
          "border border-success/50 bg-transparent hover:border-success hover:bg-muted hover:text-foreground hover:scale-[1.02] active:scale-[0.98]",
        ban:
          "hover:bg-warning/20 hover:text-warning active:scale-[0.98]",
        unban:
          "hover:bg-success/20 hover:text-success active:scale-[0.98]",
        dangerGhost:
          "text-destructive hover:bg-destructive/20 hover:text-destructive active:scale-[0.98]",
        overlay:
          "bg-background/60 text-foreground backdrop-blur-sm hover:bg-background/80 active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-8 text-base",
        xl: "h-14 rounded-lg px-10 text-lg",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
