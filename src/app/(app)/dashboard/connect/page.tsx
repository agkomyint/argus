import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { deleteApiKey, disconnectAgent } from "@/app/connect-actions";
import { CopyLine, NewKeyForm } from "@/components/dashboard/connect-kit";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { ActionButton } from "@/components/dashboard/pipeline-controls";
import { db } from "@/db";
import { oauthClient, oauthConsent } from "@/db/schema";
import { listApiKeys } from "@/lib/api-keys";
import { MCP_RESOURCE } from "@/lib/auth";
import { getAccount } from "@/lib/session";

export const metadata: Metadata = { title: "Connect an agent — ARGUS" };

const TOOLS = [
  ["list_products", "what ARGUS can make and what each needs"],
  ["create_project", "a name and the data products"],
  ["add_source", "files with lanes, weather, a sensor, a webhook or screen share"],
  ["set_tune", "how careful the agents are and how often they look"],
  ["get_project", "sources, agents and products as they run"],
  ["get_dataset", "the rows a product has made"],
] as const;

const day = (d: Date | null) => (d ? d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : "never");

export default async function ConnectPage() {
  const { user } = (await getAccount())!;
  const [agents, keys] = await Promise.all([
    db
      .select({ clientId: oauthConsent.clientId, name: oauthClient.name, scopes: oauthConsent.scopes, since: oauthConsent.createdAt })
      .from(oauthConsent)
      .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(eq(oauthConsent.userId, user.id))
      .orderBy(desc(oauthConsent.createdAt)),
    listApiKeys(user.id),
  ]);

  return (
    <>
      <PageHeader
        title="Connect an agent"
        description="Let Claude Code, Muse or any MCP client set up your projects for you: pick data products, add sources, tune the agents and read the data. It acts as you, on your own projects only."
      />

      <section className="mb-10 max-w-3xl">
        <SectionTitle>Claude Code</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">Run this in a terminal. The first time the agent uses ARGUS, a browser opens: sign in, press Allow, and it is connected.</p>
        <CopyLine text={`claude mcp add --transport http argus ${MCP_RESOURCE}`} />
        <p className="mt-3 text-sm text-muted-foreground">Then ask it, for example: <span className="text-foreground">“Set up an ARGUS project that counts people in the lobby from my photos.”</span></p>
        <ul className="mt-4 grid gap-px border bg-border text-sm sm:grid-cols-2">
          {TOOLS.map(([name, does]) => (
            <li key={name} className="bg-background px-3 py-2">
              <span className="font-mono text-xs">{name}</span> <span className="text-muted-foreground">· {does}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Other MCP clients: add a remote HTTP server at {MCP_RESOURCE}. Clients that cannot sign in through a browser can use a key instead.</p>
      </section>

      <section className="mb-10 max-w-3xl">
        <SectionTitle>Connected agents</SectionTitle>
        {agents.length ? (
          <ul className="border">
            {agents.map((a) => (
              <li key={a.clientId} className="flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-b-0">
                <span>
                  <span className="block text-sm font-medium">{a.name ?? "MCP client"}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {a.scopes.includes("argus:write") ? "can set up and change projects" : "can read projects"} · since {day(a.since)}
                  </span>
                </span>
                <ActionButton action={disconnectAgent.bind(null, a.clientId)}>Disconnect</ActionButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border border-dashed p-4 text-sm text-muted-foreground">None yet. Agents show up here once you press Allow.</p>
        )}
      </section>

      <section className="max-w-3xl">
        <SectionTitle>API keys</SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">For clients without browser sign-in. Send it as <span className="font-mono text-xs">Authorization: Bearer argus_sk_…</span> to {MCP_RESOURCE}.</p>
        <NewKeyForm mcpUrl={MCP_RESOURCE} />
        {keys.length > 0 && (
          <ul className="mt-4 border">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-b-0">
                <span>
                  <span className="block text-sm font-medium">{k.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{k.prefix}… · made {day(k.createdAt)} · last used {day(k.lastUsedAt)}</span>
                </span>
                <ActionButton action={deleteApiKey.bind(null, k.id)}>Revoke</ActionButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
