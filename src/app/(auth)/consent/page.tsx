import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { ConsentForm } from "@/components/auth/consent-form";
import { Logo } from "@/components/landing/logo";
import { db } from "@/db";
import { oauthClient } from "@/db/schema";
import { auth } from "@/lib/auth";

export const metadata = { title: "Connect an agent — ARGUS" };

type Query = Record<string, string | string[] | undefined>;

const SCOPES: Record<string, string> = {
  "argus:read": "See your projects, data products, sources, agents and datasets",
  "argus:write": "Create projects, add and configure sources, tune agents, and pause or retry work",
  offline_access: "Stay connected until you revoke it",
  profile: "Your name",
  email: "Your email address",
};

export default function ConsentPage({ searchParams }: { searchParams: Promise<Query> }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <Logo className="mb-10" />
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])));
  const valid = query.has("sig") && (await verifyOAuthQueryParams(query.toString(), (await auth.$context).secret));
  if (!valid) {
    return (
      <>
        <h1 className="text-2xl font-medium">This link has expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">Start the connection again from your coding agent.</p>
        <Link href="/projects" className="mt-6 text-sm underline underline-offset-4">Go to your projects</Link>
      </>
    );
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const clientId = query.get("client_id") ?? "";
  const [client] = await db.select({ name: oauthClient.name, uri: oauthClient.uri }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1);
  const scopes = (query.get("scope") ?? "").split(" ").filter((s) => SCOPES[s]);
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Connect a coding agent</p>
      <h1 className="mt-2 text-2xl font-medium">{client?.name ?? "An MCP client"} wants to work on your ARGUS projects</h1>
      {session && <p className="mt-2 text-sm text-muted-foreground">Signed in as {session.user.email}. It acts as you, and only on your own projects.</p>}
      <ul className="mt-8 border-t">
        {scopes.map((s) => (
          <li key={s} className="border-b px-1 py-3 text-sm">{SCOPES[s]}</li>
        ))}
      </ul>
      <ConsentForm />
      <p className="mt-6 text-xs text-muted-foreground">You can disconnect it at any time from Connect an agent in the dashboard.</p>
    </>
  );
}
