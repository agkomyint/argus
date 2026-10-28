import { desc, eq } from "drizzle-orm";
import { deleteApiKey, disconnectAgent } from "@/app/connect-actions";
import { db } from "@/db";
import { oauthClient, oauthConsent } from "@/db/schema";
import { listApiKeys } from "@/lib/api-keys";
import { MCP_RESOURCE } from "@/lib/auth";
import { AgentConnect } from "./agent-connect";

/** The studio's Agents window with the person's real connected agents and keys. Rendered on the server. */
export async function AgentConnectWindow({ userId }: { userId: string }) {
  const [agents, keys] = await Promise.all([
    db
      .select({ clientId: oauthConsent.clientId, name: oauthClient.name, scopes: oauthConsent.scopes, since: oauthConsent.createdAt })
      .from(oauthConsent)
      .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(eq(oauthConsent.userId, userId))
      .orderBy(desc(oauthConsent.createdAt)),
    listApiKeys(userId),
  ]);
  return (
    <AgentConnect
      mcpUrl={MCP_RESOURCE}
      agents={agents.map((a) => ({ clientId: a.clientId, name: a.name, canWrite: a.scopes.includes("argus:write"), since: a.since }))}
      keys={keys}
      onDisconnect={disconnectAgent}
      onRevoke={deleteApiKey}
    />
  );
}
