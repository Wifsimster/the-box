import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react'

export function useRovingTabindex<T extends HTMLElement>({
    count,
    initialIndex = 0,
}: {
    count: number
    initialIndex?: number
}) {
    const [storedIndex, setStoredIndex] = useState(() =>
        Math.max(0, initialIndex),
    )
    const focusedIndex =
        count > 0 ? Math.min(storedIndex, count - 1) : 0
    const refsMapRef = useRef<Map<number, T | null> | null>(null)
    if (refsMapRef.current === null) {
        refsMapRef.current = new Map<number, T | null>()
    }
    const refsMap = refsMapRef as { current: Map<number, T | null> }
    const userHasMoved = useRef(false)

    const focusAt = useCallback(
        (next: number) => {
            if (count === 0) return
            const clamped = ((next % count) + count) % count
            userHasMoved.current = true
            setStoredIndex(clamped)
        },
        [count],
    )

    useEffect(() => {
        if (!userHasMoved.current) return
        refsMap.current.get(focusedIndex)?.focus()
    }, [focusedIndex, refsMap])

    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                case 'ArrowRight':
                    e.preventDefault()
                    focusAt(focusedIndex + 1)
                    break
                case 'ArrowUp':
                case 'ArrowLeft':
                    e.preventDefault()
                    focusAt(focusedIndex - 1)
                    break
                case 'Home':
                    e.preventDefault()
                    focusAt(0)
                    break
                case 'End':
                    e.preventDefault()
                    focusAt(count - 1)
                    break
            }
        },
        [focusedIndex, focusAt, count],
    )

    const getItemProps = useCallback(
        (index: number) => ({
            ref: (el: T | null) => {
                if (el == null) refsMap.current.delete(index)
                else refsMap.current.set(index, el)
            },
            tabIndex: index === focusedIndex ? 0 : -1,
            onKeyDown,
        }),
        [focusedIndex, onKeyDown, refsMap],
    )

    return {
        focusedIndex,
        getItemProps,
        setFocusedIndex: setStoredIndex,
    }
}
