const FRAME_KEY_PREFIX = 'frame_top100'

export function priorMonthLabel(now: Date = new Date()): {
    year: number
    month: number
    label: string
} {
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth()
    const priorYear = m === 0 ? y - 1 : y
    const priorMonth = m === 0 ? 12 : m
    const label = `${priorYear}-${String(priorMonth).padStart(2, '0')}`
    return { year: priorYear, month: priorMonth, label }
}

export function frameItemKey(label: string): string {
    return `${FRAME_KEY_PREFIX}_${label.replace('-', '_')}`
}
