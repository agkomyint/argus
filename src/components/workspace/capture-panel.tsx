import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { observations } from "@/db/schema";
import { setProductEnabled } from "@/app/actions";
import { CaptureControls } from "@/components/workspace/capture-controls";
import { ActionButton } from "@/components/workspace/pipeline-controls";
import { agentLevel } from "@/lib/agent-levels";
import { CAPTURE_PRODUCTS, enabledCaptureProducts } from "@/lib/capture";
import { getProduct } from "@/products";

type Pt = { t: number; count: number };

/** Source: screen share. Controls, queue state and the resulting timeline all live here. */
export async function CapturePanel({ projectId, agentLevelIndex, every }: { projectId: string; agentLevelIndex: number; every?: number }) {
  const enabled = await enabledCaptureProducts(projectId);
  if (!enabled.length) {
    return (
      <div className="border p-5">
        <p className="text-sm text-muted-foreground">Screen share feeds the people products. Turn on at least one to start.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CAPTURE_PRODUCTS.map((id) => (
            <ActionButton key={id} action={setProductEnabled.bind(null, id, true)}>Turn on {getProduct(id)?.name}</ActionButton>
          ))}
        </div>
      </div>
    );
  }

  const [queue, rows] = await Promise.all([
    db.execute<{ n: number }>(sql`select count(*)::int as n from jobs where project_id = ${projectId} and kind = 'analyze_frame' and status in ('queued','running')`),
    db
      .select()
      .from(observations)
      .where(and(eq(observations.projectId, projectId), inArray(observations.type, ["people_count", "attribute_breakdown"])))
      .orderBy(desc(observations.eventTime))
      .limit(240),
  ]);
  const counts = rows
    .filter((r) => r.type === "people_count")
    .map((r) => ({ t: r.eventTime.getTime(), count: Number((r.payload as { count?: number }).count ?? 0) }))
    .sort((a, b) => a.t - b.t);
  const attrs = rows
    .filter((r) => r.type === "attribute_breakdown")
    .map((r) => ({ t: r.eventTime, ...(r.payload as { female: number; male: number; unclear: number }) }));
  const level = agentLevel(agentLevelIndex);

  return (
    <div className="grid gap-6">
      <CaptureControls queued={queue[0]?.n ?? 0} perFrame={level.costPer100 / 100} every={every} />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {CAPTURE_PRODUCTS.map((id) => (
          <span key={id}>
            {getProduct(id)?.name}: <span className={enabled.includes(id) ? "text-signal" : ""}>{enabled.includes(id) ? "on" : "off"}</span>
          </span>
        ))}
      </div>
      <Timeline points={counts} />
      {attrs.length > 0 && (
        <div className="border">
          <p className="border-b p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Apparent split per frame (rough estimate, aggregate only)</p>
          <ul>
            {attrs.slice(0, 8).map((a, i) => (
              <li key={i} className="flex justify-between gap-4 border-b px-3 py-2 font-mono text-xs last:border-b-0">
                <span className="text-muted-foreground">{a.t.toISOString().slice(11, 19)}Z</span>
                <span>female {a.female} · male {a.male} · unclear {a.unclear}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Timeline({ points }: { points: Pt[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No frames analysed yet. Share a screen and counts will appear here as the queue works through them.</p>;
  }
  const W = 640, H = 160, P = 10;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const max = Math.max(1, ...points.map((p) => p.count));
  const x = (t: number) => (points.length === 1 ? W / 2 : P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P));
  const y = (c: number) => H - P - (c / max) * (H - 2 * P);
  const avg = points.reduce((n, p) => n + p.count, 0) / points.length;
  return (
    <div className="border p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" role="img" aria-label="People count over time">
        <polyline fill="none" stroke="var(--signal)" strokeWidth="2" points={points.map((p) => `${x(p.t)},${y(p.count)}`).join(" ")} />
        {points.map((p, i) => (
          <circle key={`${p.t}-${i}`} cx={x(p.t)} cy={y(p.count)} r="2.5" fill="var(--signal)" />
        ))}
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{points.length} frames</span>
        <span>latest {points[points.length - 1].count}</span>
        <span>peak {max}</span>
        <span>average {avg.toFixed(1)}</span>
        <span>{new Date(t0).toISOString().slice(11, 19)}Z to {new Date(t1).toISOString().slice(11, 19)}Z</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Counts are model estimates from sampled frames, not exact headcounts.</p>
    </div>
  );
}
