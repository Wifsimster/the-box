/**
 * Error handling utilities for API calls and services
 */

/**
 * Custom error types
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Network request failed', originalError?: unknown) {
    super(message, 0, 'NETWORK_ERROR', originalError)
    this.name = 'NetworkError'
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, originalError?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', originalError)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication required', originalError?: unknown) {
    super(message, 401, 'AUTHENTICATION_ERROR', originalError)
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', originalError?: unknown) {
    super(message, 404, 'NOT_FOUND', originalError)
    this.name = 'NotFoundError'
  }
}

/**
 * Parse API error response
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  let message = response.statusText || 'Request failed'
  let code = `HTTP_${response.status}`

  try {
    const data = await response.json()
    if (data.error) {
      message = data.error.message || message
      code = data.error.code || code
    }
  } catch {
    // Failed to parse JSON, use default message
  }

  switch (response.status) {
    case 401:
      return new AuthenticationError(message)
    case 404:
      return new NotFoundError(message)
    case 400:
      return new ValidationError(message)
    default:
      return new ApiError(message, response.status, code)
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  delayMs: number
  backoffMultiplier: number
  retryableStatuses: number[]
  timeoutMs: number
  maxBackoffMs: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  timeoutMs: 10000, // 10 seconds default timeout
  maxBackoffMs: 5000, // Cap backoff at 5 seconds
}

/**
 * Delay helper for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch with automatic retry logic and timeout protection
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryConfig: Partial<RetryConfig> = {}
): Promise<Response> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig }
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs)

    try {
      // Merge abort signal with existing options
      const fetchOptions: RequestInit = {
        ...options,
        signal: controller.signal,
      }

      const response = await fetch(url, fetchOptions)

      // Clear timeout on successful response
      clearTimeout(timeoutId)

      // If response is OK or not retryable, return it
      if (response.ok || !config.retryableStatuses.includes(response.status)) {
        return response
      }

      // Store error for potential retry
      lastError = await parseApiError(response.clone())

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        throw lastError
      }

      // Wait before retry with capped exponential backoff
      const uncappedDelay = config.delayMs * Math.pow(config.backoffMultiplier, attempt)
      const delayTime = Math.min(uncappedDelay, config.maxBackoffMs)

      if (import.meta.env.DEV) {
        console.warn(
          `Request failed (${response.status}), retrying in ${delayTime}ms... (attempt ${attempt + 1}/${config.maxRetries})`
        )
      }

      await delay(delayTime)
    } catch (error) {
      // Clear timeout on error
      clearTimeout(timeoutId)

      // Handle abort (timeout) specifically
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new NetworkError(`Request timeout after ${config.timeoutMs}ms`, error)
      } else if (error instanceof ApiError) {
        lastError = error
      } else {
        lastError = new NetworkError('Network request failed', error)
      }

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        throw lastError
      }

      // Wait before retry with capped exponential backoff
      const uncappedDelay = config.delayMs * Math.pow(config.backoffMultiplier, attempt)
      const delayTime = Math.min(uncappedDelay, config.maxBackoffMs)

      if (import.meta.env.DEV) {
        console.warn(
          `Network error, retrying in ${delayTime}ms... (attempt ${attempt + 1}/${config.maxRetries})`
        )
      }

      await delay(delayTime)
    }
  }

  throw lastError || new NetworkError('Request failed after retries')
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
  if (error instanceof AuthenticationError) {
    return 'Please sign in to continue'
  }

  if (error instanceof NotFoundError) {
    return 'The requested resource was not found'
  }

  if (error instanceof ValidationError) {
    return error.message
  }

  if (error instanceof NetworkError) {
    return 'Network connection failed. Please check your internet connection and try again.'
  }

  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected error occurred. Please try again.'
}

/**
 * Log error for debugging
 */
export function logError(error: unknown, context?: string): void {
  const prefix = context ? `[${context}]` : '[Error]'

  if (error instanceof ApiError) {
    console.error(prefix, {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
      originalError: error.originalError,
    })
  } else {
    console.error(prefix, error)
  }
}
