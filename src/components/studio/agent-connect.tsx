"use client";

import { CopyLine, NewKeyForm } from "@/components/workspace/connect-kit";
import { ActionButton } from "@/components/workspace/pipeline-controls";

export type ConnectedAgent = { clientId: string; name: string | null; canWrite: boolean; since: Date | null };
export type AgentKey = { id: string; name: string; prefix: string; createdAt: Date; lastUsedAt: Date | null };

const TOOLS = [
  ["list_products", "what ARGUS can make and what each needs"],
  ["create_project", "a name and the data products"],
  ["add_source", "files with lanes, weather, a sensor, a webhook or screen share"],
  ["set_tune", "how careful the agents are and how often they look"],
  ["get_project", "sources, agents and products as they run"],
  ["get_dataset", "the rows a product has made"],
] as const;

const day = (d: Date | null) => (d ? d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : "never");
const label = "mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/**
 * The Agents window in the studio: connect Claude Code, Muse or any MCP client so it can set up and read
 * projects as the signed-in person. Data and actions come from the server; /design passes samples.
 */
export function AgentConnect({ mcpUrl, agents, keys, onDisconnect, onRevoke, makeKey }: {
  mcpUrl: string;
  agents: ConnectedAgent[];
  keys: AgentKey[];
  onDisconnect: (clientId: string) => Promise<unknown>;
  onRevoke: (id: string) => Promise<unknown>;
  makeKey?: (name: string) => Promise<string>;
}) {
  return (
    <div className="grid gap-6 text-sm lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section>
        <p className={label}>Claude Code</p>
        <p className="mb-3 text-muted-foreground">Run this in a terminal. The first time the agent uses ARGUS a browser opens: sign in, press Allow, and it is connected. It acts as you, on your own projects only.</p>
        <CopyLine text={`claude mcp add --transport http argus ${mcpUrl}`} />
        <p className="mt-3 text-muted-foreground">Then ask it, for example: <span className="text-foreground">“Set up an ARGUS project that counts people in the lobby from my photos.”</span></p>
        <ul className="mt-4 grid gap-px border bg-border">
          {TOOLS.map(([name, does]) => (
            <li key={name} className="bg-background px-3 py-2">
              <span className="font-mono text-xs">{name}</span> <span className="text-muted-foreground">· {does}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Other MCP clients: add a remote HTTP server at {mcpUrl}.</p>
      </section>

      <div className="min-w-0 space-y-6">
        <section>
          <p className={label}>Connected agents</p>
          {agents.length ? (
            <ul className="border">
              {agents.map((a) => (
                <li key={a.clientId} className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name ?? "MCP client"}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{a.canWrite ? "can set up and change projects" : "can read projects"} · since {day(a.since)}</span>
                  </span>
                  <ActionButton variant="ghost" action={() => onDisconnect(a.clientId)}>Disconnect</ActionButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border border-dashed p-4 text-muted-foreground">None yet. Agents show up here once you press Allow.</p>
          )}
        </section>

        <section>
          <p className={label}>API keys</p>
          <p className="mb-3 text-muted-foreground">For clients that cannot sign in through a browser. Send it as <span className="font-mono text-xs">Authorization: Bearer argus_sk_…</span></p>
          <NewKeyForm mcpUrl={mcpUrl} make={makeKey} />
          {keys.length > 0 && (
            <ul className="mt-4 border">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{k.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{k.prefix}… · made {day(k.createdAt)} · last used {day(k.lastUsedAt)}</span>
                  </span>
                  <ActionButton variant="ghost" action={() => onRevoke(k.id)}>Revoke</ActionButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
