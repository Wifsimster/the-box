import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatePanelProps {
    // 'status' renders an <output> (polite live region, matching the
    // previous hand-rolled states); 'alert' renders a div[role=alert]
    // for the error state.
    role?: 'status' | 'alert'
    icon: ReactNode
    title: string
    body: string
    // Width cap for the title/body block — the empty state historically
    // ran wider than the others.
    bodyMaxWidthClass?: string
    // Primary action buttons, laid out as a wrapping centered row.
    actions?: ReactNode
    // De-emphasized trailing affordance (e.g. "never show this game").
    footnote?: ReactNode
    // Extra content between body and actions (steps list, social proof).
    children?: ReactNode
    // Blurred backdrop image — used by the auth state to keep the round's
    // screenshot visible behind the sign-in prompt (the game itself is
    // the best signup nudge). Purely decorative.
    backdropUrl?: string | null
}

/**
 * Shared full-panel state screen for the geo deck (empty / exhausted /
 * all-done / auth-required / error). One layout, expressed as data, so
 * the five states can't drift apart visually.
 */
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
