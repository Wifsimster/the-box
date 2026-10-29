import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatePanelProps {
    role?: 'status' | 'alert'
    icon: ReactNode
    title: string
    body: string
    bodyMaxWidthClass?: string
    actions?: ReactNode
    footnote?: ReactNode
    children?: ReactNode
    backdropUrl?: string | null
}

export function StatePanel({
    role = 'status',
    icon,
    title,
    body,
    bodyMaxWidthClass = 'max-w-sm',
    actions,
    footnote,
    children,
    backdropUrl,
}: StatePanelProps) {
    const content = (
        <>
            {backdropUrl && (
                <>
                    <img
                        src={backdropUrl}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 size-full scale-105 object-cover opacity-50 blur-md"
                    />
                    <div className="absolute inset-0 bg-black/60" aria-hidden />
                </>
            )}
            <div className="relative flex flex-col items-center gap-4">
                <div className="rounded-full bg-neon-pink/10 p-4">{icon}</div>
                <div className={cn('space-y-1', bodyMaxWidthClass)}>
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <p className="text-sm text-muted-foreground">{body}</p>
                </div>
                {children}
                {actions && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        {actions}
                    </div>
                )}
                {footnote}
            </div>
        </>
    )
    const className =
        'relative flex size-full flex-col items-center justify-center overflow-hidden px-6 text-center'
    return role === 'alert' ? (
        <div role="alert" className={className}>
            {content}
        </div>
    ) : (
        <output className={className}>{content}</output>
    )
}
