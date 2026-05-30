import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react'

/**
 * WAI-ARIA radiogroup roving-tabindex helper. The current item gets
 * `tabIndex={0}` so Tab moves focus *into* the group; the rest get
 * `tabIndex={-1}` so Tab from inside the group moves focus *out*. Arrow
 * keys (and Home/End) cycle focus inside.
 *
 * The hook deliberately does **not** call any onSelect-style callback on
 * arrow nav — that would close the parent sheet on every keystroke. The
 * caller wires Space/Enter via the button's native click semantics; arrow
 * keys only move focus + the visual ring.
 *
 * Treats arrow keys as 1-D (any-direction → next/previous). For a 2-col
 * grid that means ArrowDown moves to the immediate next item rather than
 * "the one below" — a small concession in exchange for code that doesn't
 * have to know about the grid columns and stays correct after responsive
 * breakpoints, search filtering, or item re-orders.
 *
 * Usage:
 * ```tsx
 * const { getItemProps } = useRovingTabindex<HTMLButtonElement>({ count: items.length, initialIndex })
 * items.map((item, i) => <button key={item.id} {...getItemProps(i)} />)
 * ```
 */
export function useRovingTabindex<T extends HTMLElement>({
    count,
    initialIndex = 0,
}: {
    count: number
    initialIndex?: number
}) {
    // Stored index is the user's intent — possibly out of range when the
    // list shrinks (e.g. a search filter). We clamp during render so
    // consumers always see a valid index without a setState-in-effect.
    const [storedIndex, setStoredIndex] = useState(() =>
        Math.max(0, initialIndex),
    )
    const focusedIndex =
        count > 0 ? Math.min(storedIndex, count - 1) : 0
    // Lazy-init the Map once: useRef has no lazy-init form, so allocating
    // `new Map()` directly in the call would discard a fresh Map on every
    // render. Guard the assignment so it runs only on the first render.
    const refsMapRef = useRef<Map<number, T | null> | null>(null)
    if (refsMapRef.current === null) {
        refsMapRef.current = new Map<number, T | null>()
    }
    const refsMap = refsMapRef as { current: Map<number, T | null> }
    // Tracks whether the user has actually moved focus via the keyboard
    // yet. We only auto-focus the new index after they've moved focus
    // once, so the hook doesn't yank focus on initial mount.
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

    // Imperatively focus the live DOM node *after* React has applied the
    // tabIndex update, otherwise the browser may steal focus back to the
    // last tabbable ancestor when the previously-focused element flips
    // to tabIndex=-1.
    useEffect(() => {
        if (!userHasMoved.current) return
        refsMap.current.get(focusedIndex)?.focus()
    }, [focusedIndex])

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
        [focusedIndex, onKeyDown],
    )

    return {
        focusedIndex,
        getItemProps,
        // Exposed so callers can sync focus to a newly-selected item
        // without simulating a keypress (e.g. on prop changes).
        setFocusedIndex: setStoredIndex,
    }
}
