import type { ErrorInfo } from 'react'

interface ErrorReportPayload {
  name: string
  message: string
  stack?: string
  componentStack?: string
  url: string
  userAgent: string
  timestamp: string
  appVersion?: string
}

const STACK_LINE_LIMIT = 50

function buildPayload(error: Error, errorInfo?: ErrorInfo): ErrorReportPayload {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack?.split('\n').slice(0, STACK_LINE_LIMIT).join('\n'),
    componentStack: errorInfo?.componentStack
      ?.split('\n')
      .slice(0, STACK_LINE_LIMIT)
      .join('\n') ?? undefined,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timestamp: new Date().toISOString(),
    appVersion: import.meta.env.VITE_APP_VERSION,
  }
}

export function reportError(error: Error, errorInfo?: ErrorInfo): void {
  const payload = buildPayload(error, errorInfo)

  if (import.meta.env.DEV) {
    console.error('[ErrorBoundary]', payload)
    return
  }

  const endpoint = import.meta.env.VITE_ERROR_REPORTING_URL
  if (!endpoint) {
    console.error('[ErrorBoundary]', payload)
    return
  }

  try {
    const body = JSON.stringify(payload)

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      const sent = navigator.sendBeacon(endpoint, blob)
      if (sent) return
    }

    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
    })
  } catch {
  }
}
