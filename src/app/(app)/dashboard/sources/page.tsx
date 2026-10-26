import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { projectProducts, sourceLanes, sources, timelines, uploads } from "@/db/schema";
import { addLane, configureSource, deleteLane, deleteSource, deleteTimeline, runSource } from "@/app/pipeline-actions";
import { ActionButton, AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { SourceStatusLine } from "@/components/dashboard/source-rows";
import { loadSources } from "@/lib/engine";
import { srcKey, tlKey } from "@/lib/source-key";
import { AddSourceDialog } from "@/components/dashboard/add-source-dialog";
import { CapturePanel } from "@/components/dashboard/capture-panel";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { UploadPanel } from "@/components/dashboard/upload-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkspace } from "@/lib/session";
import { loadLinked } from "@/lib/product-link";
import { suggestSources } from "@/lib/product-sources";
import { getProduct } from "@/products";

export const metadata: Metadata = { title: "Sources — ARGUS" };

const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + "Z" : "never");
const TYPE: Record<string, string> = { screen: "Screen share", weather: "Weather feed", sensor_sim: "Sensor", webhook: "Webhook" };
const SETUP = "inline-block cursor-pointer border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground";

export default async function SourcesPage() {
  const ws = (await getWorkspace())!;
  const pid = ws.project.id;
  const [linked, mine, rows, connected, tls, lanes, status] = await Promise.all([
    loadLinked(pid),
    db.select().from(projectProducts).where(eq(projectProducts.projectId, pid)),
    db.select().from(uploads).where(eq(uploads.projectId, pid)).orderBy(desc(uploads.createdAt)),
    db.select().from(sources).where(eq(sources.projectId, pid)).orderBy(desc(sources.createdAt)),
    db.select().from(timelines).where(eq(timelines.projectId, pid)).orderBy(timelines.createdAt),
    db.select().from(sourceLanes).where(eq(sourceLanes.projectId, pid)).orderBy(sourceLanes.createdAt),
    loadSources(pid),
  ]);
  const statusOf = (key: string) => status.find((s) => s.key === key);

  const supported = mine.map((r) => r.productId).filter((id) => getProduct(id)?.status === "supported");
  const suggestions = suggestSources(supported, linked, (id) => getProduct(id)?.name ?? id);

  const toRow = (r: (typeof rows)[number]) => ({ id: r.id, filename: r.filename, size: r.size, status: r.status, createdAt: r.createdAt.toISOString() });
  const loose = rows.filter((r) => !r.timelineId);
  // Frames captured before the screen had a source row still show up, so they can be retried or paused.
  const orphanScreen = !connected.some((c) => c.kind === "screen") ? statusOf("screen") : undefined;
  const empty = connected.length === 0 && tls.length === 0 && loose.length === 0 && !orphanScreen;

  return (
    <>
      <AutoRefresh active={status.some((s) => s.state === "working")} everyMs={4000} />
      <PageHeader title="Sources">
        <AddSourceDialog suggestions={suggestions} />
      </PageHeader>

      <SectionTitle>Connected sources</SectionTitle>
      {empty ? (
        <p className="text-sm text-muted-foreground">Empty. Use Add source.</p>
      ) : (
        <ul>
          {tls.map((t) => {
            const mineRows = rows.filter((r) => r.timelineId === t.id);
            return (
              <li key={t.id} className="border-b py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-medium">{t.name}</span> <span className="ml-2 font-mono text-xs text-muted-foreground">files · {lanes.filter((l) => l.timelineId === t.id).length} lanes · {mineRows.length} uploaded</span></span>
                  <ActionButton variant="ghost" action={deleteTimeline.bind(null, t.id)}>Remove</ActionButton>
                </div>
                <SourceStatusLine s={statusOf(tlKey(t.id))} />
                <details className="mt-2" open={lanes.every((l) => l.timelineId !== t.id)}>
                  <summary className={SETUP}>Set up</summary>
                  <div className="mt-3 space-y-4">
                    {lanes.filter((l) => l.timelineId === t.id).map((l) => (
                      <div key={l.id} className="border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{l.name}</p>
                            {l.note && <p className="mt-0.5 text-xs text-muted-foreground">{l.note}</p>}
                          </div>
                          <ActionButton variant="ghost" action={deleteLane.bind(null, l.id)}>Remove lane</ActionButton>
                        </div>
                        <div className="mt-3"><UploadPanel laneId={l.id} uploads={rows.filter((r) => r.laneId === l.id).map(toRow)} /></div>
                      </div>
                    ))}
                    <form action={addLane.bind(null, t.id)} className="grid max-w-xl gap-2">
                      <p className="text-xs text-muted-foreground">Files go in through a lane. Name what is in it so the agents know.</p>
                      <Input name="name" placeholder="Lane name, e.g. Portrait of Maya" required maxLength={60} />
                      <Input name="note" placeholder="What is in it, e.g. Front-facing portrait photos of Maya, indoors" maxLength={300} />
                      <Button type="submit" variant="outline" className="justify-self-start">Add lane</Button>
                    </form>
                  </div>
                </details>
              </li>
            );
          })}
          {loose.length > 0 && (
            <li className="border-b py-3 text-sm">
              <span className="font-medium">Files</span> <span className="ml-2 font-mono text-xs text-muted-foreground">{loose.length} uploaded, no timeline · latest {when(loose[0].createdAt)}</span>
              <SourceStatusLine s={statusOf("files")} />
              <details className="mt-2"><summary className={SETUP}>View</summary><div className="mt-3"><UploadPanel uploads={loose.map(toRow)} /></div></details>
            </li>
          )}
          {orphanScreen && (
            <li className="border-b py-3 text-sm">
              <span className="font-medium">Screen share</span> <span className="ml-2 font-mono text-xs text-muted-foreground">Screen share · frames from an earlier capture</span>
              <SourceStatusLine s={orphanScreen} />
              <details className="mt-2"><summary className={SETUP}>Set up</summary><div className="mt-3"><CapturePanel projectId={pid} agentLevelIndex={ws.project.agentLevel} every={ws.project.frequency} /></div></details>
            </li>
          )}
          {connected.map((c) => {
            const cfg = c.config as { lat?: number; lng?: number; asset?: string };
            const ready = c.kind === "weather" ? cfg.lat !== undefined : c.kind === "sensor_sim" ? !!cfg.asset : true;
            return (
              <li key={c.id} className="border-b py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{TYPE[c.kind] ?? c.kind} · {ready ? `last data ${when(c.lastSeenAt)}` : "needs setup"}</span>
                  </span>
                  <span className="flex gap-2">
                    {ready && (c.kind === "weather" || c.kind === "sensor_sim") && <ActionButton action={runSource.bind(null, c.id)}>Run now</ActionButton>}
                    <ActionButton variant="ghost" action={deleteSource.bind(null, c.id)}>Remove</ActionButton>
                  </span>
                </div>
                {(c.kind !== "screen" || connected.find((x) => x.kind === "screen") === c) && <SourceStatusLine s={statusOf(c.kind === "screen" ? "screen" : srcKey(c.id))} />}
                {c.kind === "screen" && (
                  <details className="mt-2"><summary className={SETUP}>Set up</summary><div className="mt-3"><CapturePanel projectId={pid} agentLevelIndex={ws.project.agentLevel} every={ws.project.frequency} /></div></details>
                )}
                {c.kind === "weather" && (
                  <details className="mt-2" open={!ready}>
                    <summary className={SETUP}>Set up</summary>
                    <form action={configureSource.bind(null, c.id)} className="mt-3 flex max-w-md flex-wrap gap-2">
                      <Input name="lat" placeholder="Latitude" defaultValue={cfg.lat} required className="w-36" />
                      <Input name="lng" placeholder="Longitude" defaultValue={cfg.lng} required className="w-36" />
                      <Button type="submit" variant="outline">Save</Button>
                    </form>
                  </details>
                )}
                {c.kind === "sensor_sim" && (
                  <details className="mt-2" open={!ready}>
                    <summary className={SETUP}>Set up</summary>
                    <form action={configureSource.bind(null, c.id)} className="mt-3 max-w-md space-y-2">
                      <Input name="asset" placeholder="Asset name, e.g. Pier A" defaultValue={cfg.asset} required />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" name="surge" defaultChecked /> include a surge in the last 10 min</label>
                      <Button type="submit" variant="outline">Save</Button>
                    </form>
                  </details>
                )}
                {c.kind === "webhook" && (
                  <details className="mt-2">
                    <summary className={SETUP}>Set up</summary>
                    <pre className="mt-3 overflow-x-auto bg-muted p-3 font-mono text-xs">{`curl -X POST $APP_URL/api/ingest/${c.id} \\
  -H "x-ingest-key: ${c.ingestKey}" -H "content-type: application/json" \\
  -d '{"type":"sensor_reading","asset":"Pier A","payload":{"metric":"vibration_mm_s","value":2.4}}'`}</pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
