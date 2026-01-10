// This store is deprecated - authentication state is now managed by better-auth
//
// Instead of using useAuthStore, use the better-auth hooks directly:
//
// import { useSession, signIn, signOut, signUp } from '@/lib/auth-client';
//
// function MyComponent() {
//   const { data: session, isPending, error } = useSession();
//
//   if (isPending) return <LoadingSpinner />;
//   if (!session) return <LoginButton />;
//
//   return <div>Welcome, {session.user.name}!</div>;
// }

// Re-export better-auth hooks for backwards compatibility
export { useSession, signIn, signOut, signUp, authClient } from '@/lib/auth-client';

// Legacy compatibility layer - wraps better-auth for components still using the old API
import { useSession as useBetterAuthSession, signOut as betterAuthSignOut } from '@/lib/auth-client';

/**
 * @deprecated Use `useSession` from '@/lib/auth-client' instead
 * Legacy hook that wraps better-auth's useSession for backwards compatibility
 */
export function useAuthStore() {
  const { data: session, isPending } = useBetterAuthSession();

  return {
    user: session?.user ?? null,
    token: null, // better-auth uses cookies, not tokens
    isAuthenticated: !!session,
    isLoading: isPending,
    setUser: () => console.warn('setUser is deprecated. Use signIn/signUp from better-auth.'),
    setToken: () => console.warn('setToken is deprecated. better-auth manages sessions automatically.'),
    setLoading: () => console.warn('setLoading is deprecated. Use isPending from useSession.'),
    login: () => console.warn('login is deprecated. Use signIn from better-auth.'),
    logout: () => {
      betterAuthSignOut();
    },
  };
}
