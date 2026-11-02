"use client";
import { Empty } from "@/components/widgets/empty";
import { footageShare } from "@/lib/shot-math";
import { clock } from "@/sources/video-plan";
import type { WidgetProps } from "@/widgets/schema";

/** The label shown for each footage kind the model can propose. */
const LABEL: Record<string, string> = {
  "vehicle-camera": "Vehicle camera", aerial: "Aerial", "in-vehicle": "Inside a vehicle", "still-photo": "Still photo", podium: "Podium", reporter: "Reporter on location",
  "indoor-footage": "Indoor footage", "outdoor-footage": "Outdoor footage", graphic: "Graphic", other: "Other", unknown: "Not labelled",
};
const COLOUR: Record<string, string> = {
  "vehicle-camera": "var(--chart-1)", aerial: "var(--chart-2)", "in-vehicle": "var(--chart-3)", "still-photo": "var(--chart-4)", podium: "var(--chart-5)", reporter: "var(--chart-5)",
};
const colour = (footage: string) => COLOUR[footage] ?? "var(--muted-foreground)";
const label = (footage: string) => LABEL[footage] ?? footage;

type Shot = { no: number; footage: string; startMs: number; endMs: number; description: string; at: string; cutScore: number };

function shotsOf(rows: WidgetProps["rows"]): Shot[] {
  return rows
    .filter((r) => r.type === "video_shot")
    .map((r) => ({ no: Number(r.shot_no ?? 0), footage: String(r.footage ?? "unknown"), startMs: Number(r.start_ms ?? 0), endMs: Number(r.end_ms ?? 0), description: String(r.description ?? ""), at: clock(Number(r.start_ms ?? 0)), cutScore: Number(r.cut_score ?? 0) }))
    .sort((a, b) => a.startMs - b.startMs);
}

/** One bar for the whole video, one segment per shot and as wide as the shot is long, then a line per shot. */
export function ShotStrip({ rows, size }: WidgetProps) {
  const shots = shotsOf(rows);
  if (!shots.length) return <Empty text="No shots yet. Add a video to a Find objects lane with the Shot timeline product on." />;
  const start = shots[0].startMs;
  const total = Math.max(1, shots[shots.length - 1].endMs - start);
  const share = footageShare(shots);
  const compact = size === "compact";

  return (
    <div className={compact ? "grid h-full content-center gap-2 px-4 pt-6" : "grid gap-4"}>
      <div className="flex h-6 w-full overflow-hidden border" role="img" aria-label={`${shots.length} shots in ${clock(total)}`}>
        {shots.map((s) => <span key={s.no} title={`Shot ${s.no}: ${label(s.footage)}, ${s.at}`} className="h-full border-r border-background last:border-r-0" style={{ width: `${((s.endMs - s.startMs) / total) * 100}%`, background: colour(s.footage) }} />)}
      </div>
      <p className="font-mono text-xs text-muted-foreground">{shots.length} shots · {clock(total)}{compact ? "" : " · cuts placed between samples, about 2 s"}</p>
      {!compact && (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {share.map((s) => <li key={s.footage} className="flex items-center gap-1.5"><span className="size-2.5" style={{ background: colour(s.footage) }} />{label(s.footage)} <span className="font-mono text-muted-foreground">{Math.round(s.share * 100)}%</span></li>)}
          </ul>
          <ol className="divide-y border text-sm">
            {shots.map((s) => (
              <li key={s.no} className="grid grid-cols-[2.5rem_5.5rem_1fr] items-baseline gap-3 px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">#{s.no}</span>
                <span className="font-mono text-xs">{s.at}–{clock(s.endMs)}</span>
                <span className="min-w-0"><b className="font-medium">{label(s.footage)}</b>{s.description && <span className="text-muted-foreground"> · {s.description}</span>}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
