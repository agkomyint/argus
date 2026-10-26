import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { alerts, assets, observations, sources, uploads } from "@/db/schema";
import { loadSampleData, runQueueNow } from "@/app/pipeline-actions";
import { ActionButton, AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { getSolution } from "@/lib/solutions";
import { cn } from "@/lib/utils";

type Project = { id: string; name: string };
const SEV = { high: 3, medium: 2, low: 1 } as const;
const SEV_COLOR = { high: "var(--destructive)", medium: "var(--electric)", low: "var(--signal)" } as const;

export async function BridgeOverview({ project }: { project: Project }) {
  const pid = project.id;
  const solution = getSolution("bridge-monitoring")!;
  const [assetRows, srcRows, pending, series, [photoCount], [inspectionCount], activeJobs] = await Promise.all([
    db.select().from(assets).where(eq(assets.projectId, pid)).orderBy(asc(assets.name)),
    db.select().from(sources).where(eq(sources.projectId, pid)),
    db.select().from(alerts).where(and(eq(alerts.projectId, pid), eq(alerts.status, "pending"))).orderBy(desc(alerts.createdAt)).limit(20),
    db.select().from(observations)
      .where(and(eq(observations.projectId, pid), inArray(observations.type, ["sensor_reading", "weather", "defect_detected"])))
      .orderBy(desc(observations.eventTime)).limit(200),
    db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(and(eq(uploads.projectId, pid), eq(uploads.status, "ready"))),
    db.select({ n: sql<number>`count(*)::int` }).from(observations).where(and(eq(observations.projectId, pid), eq(observations.type, "inspection"))),
    db.select({ n: sql<number>`count(*)::int` }).from(sql`jobs`).where(sql`project_id = ${pid} and status in ('queued','running')`),
  ]);

  const worst = new Map<string, keyof typeof SEV>();
  for (const a of pending) {
    if (!a.assetId) continue;
    const cur = worst.get(a.assetId);
    if (!cur || SEV[a.severity] > SEV[cur]) worst.set(a.assetId, a.severity);
  }

  const has = {
    photos: photoCount.n > 0 || series.some((o) => o.type === "defect_detected"),
    vibration: srcRows.some((s) => s.kind === "sensor_sim" || s.kind === "webhook"),
    weather: srcRows.some((s) => s.kind === "weather"),
    inspections: inspectionCount.n > 0,
  };
  const score = solution.needs.reduce((n, s) => n + (has[s.id] ? s.lift : 0), 0);
  const simulated = srcRows.some((s) => s.kind === "sensor_sim");

  return (
    <>
      <AutoRefresh active={activeJobs[0].n > 0} />
      <PageHeader title={project.name} description={solution.name}>
        <ActionButton variant="default" action={loadSampleData}>Load sample bridge data</ActionButton>
      </PageHeader>

      <dl className="grid grid-cols-2 divide-x border-y sm:grid-cols-4">
        <Stat label="Parts watched" value={String(assetRows.length)} />
        <Stat label="Alerts to review" value={String(pending.length)} tone={pending.length ? "text-destructive" : undefined} />
        <Stat label="Sources connected" value={String(srcRows.length)} />
        <Stat label="How well we can answer" value={`${score}%`} />
      </dl>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-10">
          <section>
            <SectionTitle>Structure health</SectionTitle>
            {assetRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No parts yet. Add them in Sources.</p>
            ) : (
              <HealthMap items={assetRows.map((a) => ({ id: a.id, name: a.name, sev: worst.get(a.id) }))} />
            )}
          </section>

          <section>
            <SectionTitle>Vibration, rain and detections</SectionTitle>
            <Chart rows={series.map((o) => ({ type: o.type, t: o.eventTime.getTime(), p: o.payload }))} />
            {simulated && <p className="mt-2 text-xs text-muted-foreground">The vibration line comes from a simulated sensor. Connect a real one with a webhook in Sources.</p>}
          </section>
        </div>

        <div className="grid h-fit gap-8">
          <section>
            <SectionTitle>Alerts</SectionTitle>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>
            ) : (
              <ul>
                {pending.slice(0, 3).map((a) => (
                  <li key={a.id} className="border-b py-2.5 text-sm">
                    <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: SEV_COLOR[a.severity] }}>{a.severity}</span>
                    <Link href="/dashboard/alerts" className="block font-medium hover:underline">{a.title}</Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/dashboard/alerts" className="mt-2 inline-block text-sm text-electric hover:underline">Open alerts →</Link>
          </section>

          <section>
            <SectionTitle>Ask about this bridge</SectionTitle>
            <p className="text-sm text-muted-foreground">Ask the assistant which pier is worst, or why an alert was raised. It answers from your data.</p>
            <Link href="/dashboard/assistant" className="mt-2 inline-block text-sm text-electric hover:underline">Open the assistant →</Link>
          </section>

          <section>
            <SectionTitle>Sources feeding this</SectionTitle>
            <ul>
              {solution.needs.map((n) => (
                <li key={n.id} className="flex items-center justify-between border-b py-2 text-sm">
                  <span>{n.name}</span>
                  <span className={cn("font-mono text-xs", has[n.id] ? "text-signal" : "text-muted-foreground")}>{has[n.id] ? "connected" : `+${n.lift}% if added`}</span>
                </li>
              ))}
            </ul>
            <Link href="/dashboard/sources" className="mt-2 inline-block text-sm text-electric hover:underline">Manage sources →</Link>
          </section>

          <ActionButton action={runQueueNow}>Run queue now</ActionButton>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-4 py-4 first:pl-0">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-mono text-2xl font-medium tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

/** Deck side view: one pier per asset, coloured by its worst pending alert. */
function HealthMap({ items }: { items: { id: string; name: string; sev?: keyof typeof SEV }[] }) {
  const n = items.length;
  const w = Math.max(360, n * 120 + 60);
  const gap = (w - 60) / n;
  return (
    <div className="overflow-x-auto border">
      <svg viewBox={`0 0 ${w} 190`} className="h-48 min-w-full" role="img" aria-label="Bridge piers coloured by alert severity">
        <rect x="10" y="40" width={w - 20} height="14" fill="var(--muted-foreground)" opacity="0.5" />
        <line x1="0" y1="150" x2={w} y2="150" stroke="var(--border)" strokeWidth="2" />
        {items.map((a, i) => {
          const cx = 30 + gap * i + gap / 2;
          const fill = a.sev ? SEV_COLOR[a.sev] : "var(--signal)";
          return (
            <g key={a.id}>
              <rect x={cx - 14} y="54" width="28" height="96" fill={fill} opacity="0.85" />
              <text x={cx} y="172" textAnchor="middle" fontSize="11" className="fill-foreground font-mono">{a.name}</text>
              <text x={cx} y="186" textAnchor="middle" fontSize="9" className="fill-muted-foreground font-mono">{a.sev ?? "ok"}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type Row = { type: string; t: number; p: Record<string, unknown> };

function Chart({ rows }: { rows: Row[] }) {
  const vib = rows.filter((r) => r.type === "sensor_reading").map((r) => ({ t: r.t, v: Number(r.p.value) })).filter((r) => Number.isFinite(r.v)).sort((a, b) => a.t - b.t);
  const rain = rows.filter((r) => r.type === "weather").map((r) => ({ t: r.t, v: Number(r.p.rain_mm) })).filter((r) => Number.isFinite(r.v)).sort((a, b) => a.t - b.t);
  const hits = rows.filter((r) => r.type === "defect_detected").map((r) => r.t);
  const all = [...vib.map((r) => r.t), ...rain.map((r) => r.t), ...hits];
  if (all.length < 2) return <p className="text-sm text-muted-foreground">Not enough readings yet. Connect a source or load the sample data.</p>;

  const t0 = Math.min(...all), t1 = Math.max(...all);
  const W = 640, H = 200, L = 8, R = 8, T = 10, B = 10;
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const vMax = Math.max(1, ...vib.map((r) => r.v));
  const rMax = Math.max(1, ...rain.map((r) => r.v));
  const yv = (v: number) => H - B - (v / vMax) * (H - T - B);
  const barW = Math.max(2, (W - L - R) / Math.max(rain.length, 1) - 2);

  return (
    <div className="border p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label="Vibration line, rain bars and detection markers over time">
        {rain.map((r, i) => {
          const h = (r.v / rMax) * 60;
          return <rect key={`${r.t}-${i}`} x={x(r.t) - barW / 2} y={H - B - h} width={barW} height={h} fill="var(--electric)" opacity="0.3" />;
        })}
        {vib.length > 1 && <polyline fill="none" stroke="var(--signal)" strokeWidth="2" points={vib.map((r) => `${x(r.t)},${yv(r.v)}`).join(" ")} />}
        {hits.map((t, i) => (
          <g key={`${t}-${i}`}>
            <line x1={x(t)} x2={x(t)} y1={T} y2={H - B} stroke="var(--destructive)" strokeDasharray="3 3" />
            <circle cx={x(t)} cy={T + 4} r="4" fill="var(--destructive)" />
          </g>
        ))}
      </svg>
      <p className="mt-2 flex flex-wrap gap-x-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span><span className="text-signal">━</span> vibration (peak {vMax.toFixed(1)} mm/s)</span>
        <span><span className="text-electric">▮</span> rain (peak {rMax.toFixed(1)} mm)</span>
        <span><span className="text-destructive">●</span> detection</span>
      </p>
    </div>
  );
}
