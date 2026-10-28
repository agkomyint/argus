import { configureSource, runSource } from "@/app/pipeline-actions";
import { ActionButton } from "@/components/workspace/pipeline-controls";
import { SourceStatusLine } from "@/components/workspace/source-rows";
import { CapturePanel } from "@/components/workspace/capture-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { sources } from "@/db/schema";
import type { SourceStatus } from "@/lib/engine";
import { liveReady } from "@/lib/setup-rules";

type Source = typeof sources.$inferSelect;
const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/**
 * The setup of a live lane, in place of the file drop: the capture panel for a screen, a place for
 * weather, an asset for the sensor, the curl line for a webhook. Rendered on the server for the Lanes window.
 */
export function LiveLaneSetup({ projectId, source: s, status, agentLevel, frequency }: { projectId: string; source: Source; status?: SourceStatus; agentLevel: number; frequency?: number }) {
  const cfg = s.config as { lat?: number; lng?: number; asset?: string; surge?: boolean };
  const ready = liveReady(s);
  return (
    <section className="grid gap-3 border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={label}>{ready ? `Last data ${s.lastSeenAt ? s.lastSeenAt.toISOString().slice(0, 16).replace("T", " ") + "Z" : "never"}` : "Needs setup before it runs"}</p>
        {ready && (s.kind === "weather" || s.kind === "sensor_sim") && <ActionButton action={runSource.bind(null, s.id)}>Run now</ActionButton>}
      </div>
      {s.kind === "screen" && <CapturePanel projectId={projectId} agentLevelIndex={agentLevel} every={frequency} />}
      {s.kind === "weather" && (
        <form action={configureSource.bind(null, s.id)} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Latitude
            <Input name="lat" placeholder="16.84" defaultValue={cfg.lat} required className="w-36 font-sans text-sm normal-case tracking-normal" />
          </label>
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Longitude
            <Input name="lng" placeholder="96.17" defaultValue={cfg.lng} required className="w-36 font-sans text-sm normal-case tracking-normal" />
          </label>
          <Button type="submit" variant="outline">Save</Button>
        </form>
      )}
      {s.kind === "sensor_sim" && (
        <form action={configureSource.bind(null, s.id)} className="grid max-w-md gap-2">
          <Input name="asset" placeholder="Asset name, e.g. Pier A" aria-label="Asset name" defaultValue={cfg.asset} required />
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" name="surge" defaultChecked={cfg.surge ?? true} /> include a surge in the last 10 min</label>
          <Button type="submit" variant="outline" className="justify-self-start">Save</Button>
        </form>
      )}
      {s.kind === "webhook" && (
        <pre className="overflow-x-auto bg-muted p-3 font-mono text-xs">{`curl -X POST $APP_URL/api/ingest/${s.id} \\
  -H "x-ingest-key: ${s.ingestKey}" -H "content-type: application/json" \\
  -d '{"type":"sensor_reading","asset":"Pier A","payload":{"metric":"vibration_mm_s","value":2.4}}'`}</pre>
      )}
      <SourceStatusLine s={status} />
    </section>
  );
}
