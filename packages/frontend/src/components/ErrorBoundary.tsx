import { Component, type ReactNode, type ErrorInfo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/errorReporter'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, errorInfo: ErrorInfo, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

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
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    reportError(error, errorInfo)
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
      if (this.props.fallback && this.state.errorInfo) {
        return this.props.fallback(
          this.state.error,
          this.state.errorInfo,
          this.handleReset
        )
      }

      return <DefaultErrorFallback error={this.state.error} reset={this.handleReset} />
    }

    return this.props.children
  }
}

function DefaultErrorFallback({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const { t } = useTranslation()
  const isDev = import.meta.env.DEV

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="size-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="size-10 text-destructive" />
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">{t('errors.boundary.title')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('errors.boundary.message')}
        </p>

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

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset} variant="default" className="min-h-11 gap-2">
            <RefreshCw className="size-4" />
            {t('errors.boundary.tryAgain')}
          </Button>
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            className="min-h-11 gap-2"
          >
            <Home className="size-4" />
            {t('errors.boundary.goHome')}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground mt-6">
          {t('errors.boundary.contactSupport')}
        </p>
      </div>
    </div>
  )
}

export function LazyComponentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, _, reset) => {
        const isChunkError =
          error.message.includes('Failed to fetch dynamically imported module') ||
          error.message.includes('Loading chunk') ||
          error.message.includes('ChunkLoadError')

        if (isChunkError) {
          return <LazyLoadErrorFallback reset={reset} />
        }

        return <DefaultErrorFallback error={error} reset={reset} />
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

function LazyLoadErrorFallback({ reset }: { reset: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="size-20 rounded-full bg-warning/10 flex items-center justify-center">
            <AlertTriangle className="size-10 text-warning" />
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2">{t('errors.lazyLoad.title')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('errors.lazyLoad.message')}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => window.location.reload()} variant="default" className="min-h-11 gap-2">
            <RefreshCw className="size-4" />
            {t('errors.lazyLoad.reload')}
          </Button>
          <Button onClick={reset} variant="outline" className="min-h-11 gap-2">
            {t('errors.lazyLoad.tryAgain')}
          </Button>
        </div>
      </div>
    </div>
  )
}
