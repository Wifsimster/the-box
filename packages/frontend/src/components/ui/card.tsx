import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface CardProps extends React.ComponentProps<"div"> {
  interactive?: boolean
}

function Card({ className, interactive = false, children, ...props }: CardProps) {
  const baseClasses = "rounded-xl border border-border bg-card text-card-foreground shadow-sm"

  if (interactive) {
    // Extract only the props we need for motion.div to avoid type conflicts
    const { onClick, onMouseEnter, onMouseLeave, style, id } = props
    return (
      <motion.div
        data-slot="card"
        id={id}
        style={style}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        whileHover={{
          borderColor: 'oklch(0.7 0.25 300 / 0.4)',
          boxShadow: '0 0 25px oklch(0.7 0.25 300 / 0.15)',
        }}
        transition={{ duration: 0.2 }}
        className={cn(
          baseClasses,
          "cursor-pointer transition-colors",
          className
        )}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <div
      data-slot="card"
      className={cn(baseClasses, className)}
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

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
