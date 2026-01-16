import * as React from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface EmptyStateCardProps {
    icon: LucideIcon
    message: string
    description?: string
    action?: {
        label: string
        onClick: () => void
    }
    className?: string
    animate?: boolean
}

export function EmptyStateCard({
    icon: Icon,
    message,
    description,
    action,
    className,
    animate = true,
}: EmptyStateCardProps) {
    const content = (
        <div className={cn("flex flex-col items-center justify-center py-8 px-4 text-center", className)}>
            <div className="relative mb-4">
                <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl" />
                <Icon className="relative w-12 h-12 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{message}</p>
            {description && (
                <p className="text-xs text-muted-foreground/70 mb-4 max-w-xs">{description}</p>
            )}
            {action && (
                <Button variant="outline" size="sm" onClick={action.onClick} className="mt-2">
                    {action.label}
                </Button>
            )}
        </div>
    )

    if (!animate) {
        return content
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
        >
            {content}
        </motion.div>
    )
}
