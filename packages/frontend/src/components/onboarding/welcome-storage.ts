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
