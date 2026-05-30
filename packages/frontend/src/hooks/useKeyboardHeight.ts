import { useState, useEffect, useCallback, useRef } from 'react';

interface KeyboardState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
}

/**
 * Hook to detect mobile keyboard appearance using the visualViewport API.
 * Only triggers on mobile devices when the virtual keyboard opens.
 */
export function useKeyboardHeight(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    isKeyboardOpen: false,
    keyboardHeight: 0,
  });

  const updateKeyboardState = useCallback(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // The keyboard height is the difference between the layout viewport
    // (window.innerHeight) and the visual viewport (viewport.height)
    const keyboardHeight = Math.round(window.innerHeight - viewport.height);
    const KEYBOARD_THRESHOLD = 150;

    const isOpen = keyboardHeight > KEYBOARD_THRESHOLD;

    setState((prev) => {
      // Only update if values changed to avoid unnecessary re-renders
      if (prev.isKeyboardOpen === isOpen && prev.keyboardHeight === (isOpen ? keyboardHeight : 0)) {
        return prev;
      }
      return {
        isKeyboardOpen: isOpen,
        keyboardHeight: isOpen ? keyboardHeight : 0,
      };
    });
  }, []);

  // Keep the latest handler in a ref so the subscription effect can read
  // `handlerRef.current()` through a stable wrapper and never re-subscribe
  // when the handler identity changes.
  const handlerRef = useRef(updateKeyboardState);
  useEffect(() => {
    handlerRef.current = updateKeyboardState;
  }, [updateKeyboardState]);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return;
    }

    const listener = () => handlerRef.current();

    // Initial check
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Necessary to check keyboard state on mount
    listener();

    // The handler only reads viewport metrics and never calls
    // event.preventDefault(), so { passive: true } is safe and avoids
    // blocking scroll performance.
    viewport.addEventListener('resize', listener, { passive: true });
    viewport.addEventListener('scroll', listener, { passive: true });

    return () => {
      viewport.removeEventListener('resize', listener);
      viewport.removeEventListener('scroll', listener);
    };
  }, []);

  return state;
}
