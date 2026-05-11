const TOUR_DONE_FLAG = 'theBox.homeTourCompleted'
const TOUR_PENDING_FLAG = 'theBox.homeTourPending'

export function hasCompletedTour(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_FLAG) === '1'
  } catch {
    return false
  }
}

export function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_DONE_FLAG, '1')
    localStorage.removeItem(TOUR_PENDING_FLAG)
  } catch {
    // storage blocked — silently skip
  }
}

export function clearTourCompleted(): void {
  try {
    localStorage.removeItem(TOUR_DONE_FLAG)
  } catch {
    // storage blocked — silently skip
  }
}

export function markTourPending(): void {
  try {
    localStorage.setItem(TOUR_PENDING_FLAG, '1')
  } catch {
    // storage blocked — silently skip
  }
}

export function consumeTourPending(): boolean {
  try {
    const pending = localStorage.getItem(TOUR_PENDING_FLAG) === '1'
    if (pending) localStorage.removeItem(TOUR_PENDING_FLAG)
    return pending
  } catch {
    return false
  }
}
