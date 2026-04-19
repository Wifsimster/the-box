import * as React from "react"
import { motion } from "framer-motion"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-xl border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      variant: {
        default: "border-border",
        neon: "border-primary/40",
        success: "border-success/50",
        error: "border-error/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>

interface CardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardVariants> {
  interactive?: boolean
}

function Card({
  className,
  interactive = false,
  variant,
  children,
  ...props
}: CardProps) {
  const classes = cn(cardVariants({ variant }), className)

  if (interactive) {
    const { onClick, onMouseEnter, onMouseLeave, style, id } = props
    return (
      <motion.div
        data-slot="card"
        data-variant={variant ?? "default"}
        id={id}
        style={style}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        whileHover={{ boxShadow: "var(--glow-md)" }}
        transition={{ duration: 0.2 }}
        className={cn(classes, "cursor-pointer transition-colors")}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div
      data-slot="card"
      data-variant={variant ?? "default"}
      className={classes}
      {...props}
    >
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-6 pt-0", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
