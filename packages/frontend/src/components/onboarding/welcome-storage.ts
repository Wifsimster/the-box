import { useSyncExternalStore } from 'react'

const WELCOME_FLAG = 'theBox.newUserWelcome'

export function markWelcomePending(): void {
  try {
    localStorage.setItem(WELCOME_FLAG, '1')
  } catch {
    // storage blocked — silently skip, welcome simply won't appear
  }
}

export function consumeWelcomeFlag(): boolean {
  try {
    const pending = localStorage.getItem(WELCOME_FLAG) === '1'
    if (pending) localStorage.removeItem(WELCOME_FLAG)
    return pending
  } catch {
    return false
  }
}

let welcomeActive = false
const welcomeListeners = new Set<() => void>()

export function setWelcomeActive(active: boolean): void {
  if (welcomeActive === active) return
  welcomeActive = active
  welcomeListeners.forEach((listener) => listener())
}

function subscribeWelcomeActive(listener: () => void): () => void {
  welcomeListeners.add(listener)
  return () => {
    welcomeListeners.delete(listener)
  }
}

function getWelcomeActive(): boolean {
  return welcomeActive
}

/**
 * True while the first-run WelcomeModal is on screen. Other auto-opening
 * surfaces (daily reward, changelog, home tour) wait for it so a new player
 * never gets two dialogs stacked on top of each other.
 */
export function useWelcomeActive(): boolean {
  return useSyncExternalStore(subscribeWelcomeActive, getWelcomeActive, () => false)
}
