import { useState, useEffect, useCallback, useRef } from 'react';

interface KeyboardState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
}

export function useKeyboardHeight(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    isKeyboardOpen: false,
    keyboardHeight: 0,
  });

  const updateKeyboardState = useCallback(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const keyboardHeight = Math.round(window.innerHeight - viewport.height);
    const KEYBOARD_THRESHOLD = 150;

    const isOpen = keyboardHeight > KEYBOARD_THRESHOLD;

    setState((prev) => {
      if (prev.isKeyboardOpen === isOpen && prev.keyboardHeight === (isOpen ? keyboardHeight : 0)) {
        return prev;
      }
      return {
        isKeyboardOpen: isOpen,
        keyboardHeight: isOpen ? keyboardHeight : 0,
      };
    });
  }, []);

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

    listener();

    viewport.addEventListener('resize', listener, { passive: true });
    viewport.addEventListener('scroll', listener, { passive: true });

    return () => {
      viewport.removeEventListener('resize', listener);
      viewport.removeEventListener('scroll', listener);
    };
  }, []);

  return state;
}
