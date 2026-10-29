import { createAuthClient } from "better-auth/react";
import {
  usernameClient,
  anonymousClient,
  adminClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

const getBaseURL = (): string => {
  if (import.meta.env.VITE_API_URL) {
    const baseUrl = import.meta.env.VITE_API_URL
    return baseUrl.endsWith('/auth') ? baseUrl : `${baseUrl}/auth`
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/auth`
  }
  return 'http://localhost:5173/api/auth'
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  fetchOptions: {
    credentials: 'include',
  },
  plugins: [
    usernameClient(),
    anonymousClient(),
    adminClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("redirect") ?? "";
        const url = next
          ? `/two-factor?redirect=${encodeURIComponent(next)}`
          : "/two-factor";
        const langMatch = window.location.pathname.match(/^\/([a-z]{2})\//);
        const lang = langMatch ? `/${langMatch[1]}` : "";
        window.location.href = `${lang}${url}`;
      },
    }),
    passkeyClient(),
  ],
});

export const {
  signIn,
  signOut,
  useSession,
} = authClient;

export const requestPasswordReset = authClient.requestPasswordReset;
export const resetPassword = authClient.resetPassword;
