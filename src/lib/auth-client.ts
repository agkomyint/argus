import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

// oauthProviderClient carries the signed OAuth query through sign-in, so a coding agent's
// authorization request resumes on /consent once the person has logged in.
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

/** True on /login when a coding agent (MCP client) sent the person here to sign in. */
export function isOAuthLogin() {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return q.has("client_id") && q.has("sig");
}
