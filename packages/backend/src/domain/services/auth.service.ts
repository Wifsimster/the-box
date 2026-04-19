// Authentication is handled by better-auth; this module keeps the shared
// AuthError type that domain code throws when auth invariants are violated.

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
