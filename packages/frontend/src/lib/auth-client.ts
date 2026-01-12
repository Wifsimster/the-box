import { createAuthClient } from "better-auth/react";
import { usernameClient, anonymousClient, adminClient } from "better-auth/client/plugins";

// Better Auth requires a full URL (with protocol and host)
// If VITE_API_URL is set, use it directly and append /auth
// Otherwise, use current origin + /api/auth to leverage Vite proxy in development
const getBaseURL = (): string => {
  if (import.meta.env.VITE_API_URL) {
    // If VITE_API_URL is set, ensure it includes /auth
    const baseUrl = import.meta.env.VITE_API_URL
    return baseUrl.endsWith('/auth') ? baseUrl : `${baseUrl}/auth`
  }
  // Use current origin + /api/auth (works with Vite proxy in dev, and production)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/auth`
  }
  // Fallback for SSR (shouldn't happen in this app, but just in case)
  return 'http://localhost:5173/api/auth'
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  fetchOptions: {
    credentials: 'include', // Required for cookies to be sent with requests
  },
  plugins: [
    usernameClient(),
    anonymousClient(),
    adminClient(),
  ],
});

// Export individual methods and hooks for convenience
export const {
  signIn,
  signUp,
  signOut,
  useSession,
} = authClient;

// Password reset functions
export const requestPasswordReset = authClient.requestPasswordReset;
export const resetPassword = authClient.resetPassword;

// Re-export the client for cases where you need direct access
export default authClient;
