"use client";

import { Check, ChevronDown, ChevronUp, CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { retryUpload, setSourcePaused } from "@/app/engine-actions";
import { continueFile, Progress, useDrops, type LaneDrop } from "@/components/studio/lane-drop";
import { errorOf } from "@/components/workspace/lane-upload";
import { ACTION_LABEL, type StuckFile } from "@/lib/pipeline-state";
import { cn } from "@/lib/utils";

/**
 * A strip above the timeline for files that stopped on the way from upload to read. One line per file: what
 * stopped, and the one button that carries on from there. Nothing is sent twice. It renders nothing when
 * everything is moving. Shown in /design STU-11; `preview` fixes the drops and turns the buttons off.
 */
export function PipelineAttention({ projectId, items, total = 0, preview, demo }: { projectId: string; items: StuckFile[]; /** Every file in the project, so a quiet "all read" line can show when none is stuck. */ total?: number; preview?: { drops?: Record<string, LaneDrop> }; /** Made-up rows from ?pipeline=demo: the buttons are off. */ demo?: boolean }) {
  const router = useRouter();
  const live = useDrops();
  const drops = preview?.drops ?? live;
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  const pick = useRef<HTMLInputElement>(null);
  const picking = useRef<StuckFile | null>(null);
  if (!items.length) {
    if (!total) return null;
    return <p className="flex h-6 shrink-0 items-center gap-1.5 border-t bg-card px-3 font-mono text-[10px] text-signal"><Check className="size-3" />All {total} file{total === 1 ? "" : "s"} uploaded, sampled and read · nothing stopped</p>;
  }

  const refresh = () => router.refresh();
  const run = async (f: StuckFile, mine?: File) => {
    if (preview || demo) return;
    setBusy(f.id);
    setSaid((s) => ({ ...s, [f.id]: "" }));
    try {
      if (f.action === "sample") await continueFile({ id: f.laneId }, f, projectId, refresh, mine);
      else if (f.action === "retry") await retryUpload(f.id);
      else if (f.action === "resume" && f.source) await setSourcePaused(f.source, false);
      else if (f.action === "finish") {
        const res = await fetch(`/api/uploads/${f.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        if (!res.ok) throw new Error(res.status === 409 ? "The file never finished uploading. Add it to the lane again." : await errorOf(res, "Could not finish this upload"));
      }
      refresh();
    } catch (e) {
      setSaid((s) => ({ ...s, [f.id]: e instanceof Error ? e.message : "That did not work" }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Files that need attention" className="shrink-0 border-t border-chart-4/50 bg-chart-4/10">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex h-7 w-full items-center gap-2 px-3 text-left font-mono text-[11px] text-chart-4">
        <CircleAlert className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{items.length} file{items.length === 1 ? "" : "s"} stopped before the AI finished reading {items.length === 1 ? "it" : "them"}{demo ? " · demo rows, buttons off" : ""}</span>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
      </button>
      {open && (
        <ul className="max-h-36 divide-y divide-chart-4/20 overflow-y-auto border-t border-chart-4/20 text-xs">
          {items.map((f) => {
            const drop = drops[f.laneId];
            const working = busy === f.id || (!!drop && !drop.error);
            const askFile = f.action === "sample" && !!drop?.error && /choose the same file/i.test(drop.error);
            return (
              <li key={f.id} className="grid gap-1 px-3 py-1.5 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:items-center @xl:gap-3">
                <span className="min-w-0">
                  <span className="block truncate"><span className="font-medium">{f.filename}</span> <span className="text-muted-foreground">· {f.lane}</span></span>
                  <span className={cn("block truncate", said[f.id] || drop?.error ? "text-destructive" : "text-muted-foreground")}>
                    <span className="text-chart-4">{f.label}</span> · {said[f.id] || (f.action === "sample" && drop?.error) || f.detail}
                  </span>
                </span>
                {working && drop && !drop.error && f.action === "sample" ? (
                  <span className="w-48"><Progress d={drop} /></span>
                ) : (
                  <button type="button" disabled={working || !!preview || !!demo}
                    onClick={() => { if (askFile) { picking.current = f; pick.current?.click(); } else void run(f); }}
                    className="justify-self-start border border-chart-4 px-2 py-0.5 text-chart-4 hover:bg-chart-4/10 disabled:opacity-40 @xl:justify-self-end">
                    {working ? "Working…" : askFile ? "Choose the file" : ACTION_LABEL[f.action]}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <input ref={pick} type="file" hidden accept="video/*" onChange={(e) => { const mine = e.target.files?.[0]; e.target.value = ""; if (mine && picking.current) void run(picking.current, mine); }} />
    </section>
  );
}
