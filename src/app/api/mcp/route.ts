import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { userForApiKey } from "@/lib/api-keys";
import { auth, MCP_RESOURCE } from "@/lib/auth";
import { argusMcpServer } from "@/lib/mcp/server";

// MCP over streamable HTTP for coding agents. Sign-in is OAuth through Better Auth (the agent opens
// /login and /consent); a personal API key (argus_sk_…) works too, for clients without OAuth.
const serve = (request: Request, userId: string, write: boolean) => createMcpHandler(() => argusMcpServer(userId, { write })).fetch(request);

const oauth = requireMcpAuth(
  auth,
  (request, claims) => serve(request, String(claims.sub), String(claims.scope ?? "").split(" ").includes("argus:write")),
  { resource: MCP_RESOURCE, requiredScopes: ["argus:read"] },
);

async function handler(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer (argus_sk_\S+)$/)?.[1];
  if (!key) return oauth(request);
  const userId = await userForApiKey(key);
  if (!userId) return Response.json({ error: "invalid_token" }, { status: 401 });
  return serve(request, userId, true);
}

export { handler as GET, handler as POST, handler as DELETE };
