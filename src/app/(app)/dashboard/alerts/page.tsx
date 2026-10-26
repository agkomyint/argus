import { desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { alerts, assets, jobs } from "@/db/schema";
import { reviewAlert } from "@/app/pipeline-actions";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { ActionButton, AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Alerts — ARGUS" };

type Claim = { text: string; refs: string[]; numbers: number[] };
type Report = {
  claims?: Claim[];
  rejectedClaims?: (Claim & { reason: string })[];
  limitations?: string[];
  recommendedAction?: string;
  severityReasons?: string[];
  trace?: { agent: string; ms: number; note: string }[];
  model?: string;
};

const SEV = { high: "text-destructive", medium: "text-electric", low: "text-muted-foreground" } as const;

export default async function AlertsPage() {
  const ws = (await getWorkspace())!;
  const [rows, [busy]] = await Promise.all([
    db
      .select({ a: alerts, asset: assets.name })
      .from(alerts)
      .leftJoin(assets, eq(alerts.assetId, assets.id))
      .where(eq(alerts.projectId, ws.project.id))
      .orderBy(desc(alerts.createdAt))
      .limit(50),
    db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(sql`${jobs.projectId} = ${ws.project.id} and ${jobs.status} in ('queued','running')`),
  ]);

  return (
    <>
      <AutoRefresh active={busy.n > 0} />
      <PageHeader title="Alerts" description="Drafted by the agents from fused evidence. Nothing is acted on until a person approves it." />
      {busy.n > 0 && <p className="mb-6 font-mono text-xs text-electric">{busy.n} job(s) running — this page refreshes itself.</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alerts yet. Load the sample bridge data on the Overview, or press Investigate on a detection.</p>
      ) : (
        <ul className="space-y-10">
          {rows.map(({ a, asset }) => {
            const r = a.report as Report;
            return (
              <li key={a.id}>
                <SectionTitle>
                  <span className={SEV[a.severity]}>{a.severity}</span> · {asset ?? "unmatched asset"} · {a.status} · {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}Z
                </SectionTitle>
                <h3 className="text-lg font-medium">{a.title}</h3>
                <p className="mt-2 max-w-3xl text-sm">{a.summary}</p>

                {r.severityReasons && r.severityReasons.length > 0 && (
                  <p className="mt-3 font-mono text-xs text-muted-foreground">Severity (rule-based): {r.severityReasons.join(" · ")}</p>
                )}

                {r.claims && r.claims.length > 0 && (
                  <div className="mt-5">
                    <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Verified claims</p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {r.claims.map((c, i) => (
                        <li key={i} className="border-l-2 border-signal pl-3">
                          {c.text}
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{c.refs.map((x) => x.slice(0, 8)).join(", ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.rejectedClaims && r.rejectedClaims.length > 0 && (
                  <div className="mt-5">
                    <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Rejected by verifier</p>
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      {r.rejectedClaims.map((c, i) => (
                        <li key={i} className="border-l-2 border-destructive pl-3">
                          {c.text} <span className="font-mono text-xs">({c.reason})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.limitations && r.limitations.length > 0 && (
                  <div className="mt-5">
                    <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Limitations</p>
                    <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                      {r.limitations.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.recommendedAction && (
                  <p className="mt-5 text-sm">
                    <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Recommended · </span>
                    {r.recommendedAction}
                  </p>
                )}

                {r.trace && (
                  <p className="mt-4 font-mono text-[11px] text-muted-foreground">
                    <a href="/dashboard/agents" className="underline">How the agents worked</a> · {r.trace.map((t) => `${t.agent} ${t.ms}ms (${t.note})`).join("  →  ")}
                    {r.model && ` · model ${r.model}`}
                  </p>
                )}

                {a.status === "pending" ? (
                  <div className="mt-5 flex gap-2">
                    <ActionButton variant="default" action={reviewAlert.bind(null, a.id, "approved")}>Approve</ActionButton>
                    <ActionButton action={reviewAlert.bind(null, a.id, "dismissed")}>Dismiss</ActionButton>
                  </div>
                ) : (
                  <p className="mt-5 font-mono text-xs text-muted-foreground">Reviewed {a.reviewedAt?.toISOString().slice(0, 16).replace("T", " ")}Z</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
