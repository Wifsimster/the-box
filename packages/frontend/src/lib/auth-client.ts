import { createAuthClient } from "better-auth/react";
import { usernameClient, anonymousClient, adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "",
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
