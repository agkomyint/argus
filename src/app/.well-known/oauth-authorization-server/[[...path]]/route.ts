import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// The issuer lives under /api/auth, so MCP clients look for its metadata here at the root.
export const GET = oauthProviderAuthServerMetadata(auth);
