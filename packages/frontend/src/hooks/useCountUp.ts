import { useEffect, useState } from 'react'

export function useCountUp(target: number, durationMs: number): number {
    const prefersReduced =
        typeof window !== 'undefined' &&
        !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const [value, setValue] = useState(() => (prefersReduced ? target : 0))
    useEffect(() => {
        let raf = 0
        const start = performance.now()
        const tick = (now: number) => {
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
