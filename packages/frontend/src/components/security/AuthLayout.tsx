import type { ReactNode } from 'react'
import { m } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle } from 'lucide-react'
import { CubeBackground } from '@/components/backgrounds/CubeBackground'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface AuthLayoutProps {
  title: string
  subtitle?: ReactNode
  icon?: LucideIcon
  iconClassName?: string
  footer?: ReactNode
  children?: ReactNode
}

/**
 * Shared shell for every sign-in style screen (login, register, password
 * reset, 2FA). On phones the card sits near the top so the on-screen keyboard
 * never covers the submit button; from `sm` up it is vertically centered.
 */
export function AuthLayout({ title, subtitle, icon: Icon, iconClassName, footer, children }: AuthLayoutProps) {
  return (
    <>
      <CubeBackground />
      <div className="relative z-10 flex min-h-[var(--page-h)] items-start justify-center px-4 py-6 sm:items-center sm:py-8">
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="bg-card/80 shadow-2xl backdrop-blur-xl">
            <CardHeader className="items-center text-center">
              {Icon && (
                <div
                  className={cn(
                    'mb-2 inline-flex size-12 items-center justify-center rounded-full bg-neon-purple/15 text-neon-purple',
                    iconClassName,
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </div>
              )}
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
            </CardHeader>
            <CardContent className="space-y-5">
              {children}
              {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
            </CardContent>
          </Card>
        </m.div>
      </div>
    </>
  )
}

/** Inline form-level error, announced to screen readers as soon as it appears. */
export function AuthFormError({ children, className, id }: { children?: ReactNode; className?: string; id?: string }) {
  if (!children) return null
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}
