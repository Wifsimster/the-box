import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, errorInfo: ErrorInfo, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the whole app.
 *
 * Usage:
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('Error Boundary caught an error:', error, errorInfo)
    }

    // Store error info in state
    this.setState({ errorInfo })

    // TODO: Log error to error reporting service (e.g., Sentry)
    // logErrorToService(error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Custom fallback if provided
      if (this.props.fallback && this.state.errorInfo) {
        return this.props.fallback(
          this.state.error,
          this.state.errorInfo,
          this.handleReset
        )
      }

      // Default fallback UI
      return <DefaultErrorFallback error={this.state.error} reset={this.handleReset} />
    }

    return this.props.children
  }
}

/**
 * Default error fallback UI
 */
function DefaultErrorFallback({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const isDev = import.meta.env.DEV

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="mb-6 flex justify-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
        </div>

        {/* Error Message */}
        <h1 className="text-3xl font-bold mb-2">Oops! Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          We're sorry for the inconvenience. The application encountered an unexpected error.
        </p>

        {/* Error Details (Dev Only) */}
        {isDev && (
          <div className="mb-6 p-4 bg-card border border-border rounded-lg text-left">
            <p className="text-sm font-mono text-destructive mb-2">
              {error.name}: {error.message}
            </p>
            {error.stack && (
              <pre className="text-xs text-muted-foreground overflow-x-auto">
                {error.stack.split('\n').slice(0, 5).join('\n')}
              </pre>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            className="gap-2"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Button>
        </div>

        {/* Help Text */}
        <p className="text-sm text-muted-foreground mt-6">
          If this problem persists, please contact support.
        </p>
      </div>
    </div>
  )
}

/**
 * Lazy Component Error Boundary
 *
 * Specialized error boundary for lazy-loaded components (code splitting).
 * Shows a retry button when chunk loading fails.
 */
export function LazyComponentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, _, reset) => {
        // Check if it's a chunk load error
        const isChunkError =
          error.message.includes('Failed to fetch dynamically imported module') ||
          error.message.includes('Loading chunk') ||
          error.message.includes('ChunkLoadError')

        if (isChunkError) {
          return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
              <div className="max-w-md w-full text-center">
                <div className="mb-6 flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center">
                    <AlertTriangle className="w-10 h-10 text-warning" />
                  </div>
                </div>

                <h1 className="text-3xl font-bold mb-2">Page Failed to Load</h1>
                <p className="text-muted-foreground mb-6">
                  We couldn't load this page. This might be due to a network issue or an outdated version.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button onClick={() => window.location.reload()} variant="default" className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Reload Page
                  </Button>
                  <Button onClick={reset} variant="outline" className="gap-2">
                    Try Again
                  </Button>
                </div>
              </div>
            </div>
          )
        }

        // For non-chunk errors, use default fallback
        return <DefaultErrorFallback error={error} reset={reset} />
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
