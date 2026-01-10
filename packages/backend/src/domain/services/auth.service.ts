// This file is deprecated - authentication is now handled by better-auth
// Keeping this file for backwards compatibility during migration

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

// Legacy auth service - most functionality moved to better-auth
// Only keeping utility functions that may be used elsewhere
export const authService = {
  // Deprecated: Use better-auth session API instead
  verifyToken(_token: string): { userId: string; isGuest: boolean } | null {
    console.warn('authService.verifyToken is deprecated. Use better-auth session API.')
    return null
  },
}
