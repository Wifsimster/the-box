import { useEffect, useState } from 'react'

/**
 * Animated count-up toward `target` (ease-out cubic over `durationMs`).
 * Under prefers-reduced-motion the final value renders immediately —
 * no intermediate frames. Used by the geo reveal sheet and run recap.
 */
export function useCountUp(target: number, durationMs: number): number {
    const prefersReduced =
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const [value, setValue] = useState(() => (prefersReduced ? target : 0))
    useEffect(() => {
        let raf = 0
        const start = performance.now()
        const tick = (now: number) => {
            // Reduced motion: jump straight to the final value (still via
            // rAF so the state write never happens synchronously in the
            // effect body).
            const t = prefersReduced
                ? 1
                : Math.min(1, (now - start) / durationMs)
            const eased = 1 - Math.pow(1 - t, 3)
            setValue(Math.round(target * eased))
            if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [target, durationMs, prefersReduced])
    return value
}
