import { useState, useEffect, useCallback } from 'react';

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

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return;
    }

    // Initial check
    updateKeyboardState();

    viewport.addEventListener('resize', updateKeyboardState);
    viewport.addEventListener('scroll', updateKeyboardState);

    return () => {
      viewport.removeEventListener('resize', updateKeyboardState);
      viewport.removeEventListener('scroll', updateKeyboardState);
    };
  }, [updateKeyboardState]);

  return state;
}
