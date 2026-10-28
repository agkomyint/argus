"use client";

import { Activity, CircleAlert, CloudSun, FileUp, FolderOpen, Loader2, Monitor, Plus, Webhook, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { openStudioWindow } from "@/components/studio/studio-window";
import { localDay, uploadToLane } from "@/components/workspace/lane-upload";
import type { LaneAnalyzer, LaneInput } from "@/lib/lane-kinds";
import { ANALYZER_LABEL, INPUT_LABEL } from "@/lib/setup-rules";
import { cn } from "@/lib/utils";

/**
 * Everything comes into the studio through a lane. Files go in by dropping them on a file lane: on its row
 * in the Sources dock, or on the tile that appears over the whole studio while files are dragged in. A live
 * lane (screen, weather, sensor, webhook) shows its state instead and opens its setup. Progress lives in one
 * small store, so a drop on the overlay shows on the lane's row too.
 */

export type StudioLane = { id: string; name: string; analyzer: LaneAnalyzer; input: LaneInput; files: number; reading: number; thumb?: string; live?: { ready: boolean; last?: string } };

export const INPUT_ICON: Record<LaneInput, LucideIcon> = { files: FolderOpen, screen: Monitor, weather: CloudSun, sensor_sim: Activity, webhook: Webhook };
export type LaneDrop = { name: string; pct: number; step?: string; left: number; error?: string };

// ── the drop store ──────────────────────────────────────────────────────

let drops: Record<string, LaneDrop> = {};
const listeners = new Set<() => void>();
const set = (laneId: string, d: LaneDrop | null) => {
  drops = { ...drops };
  if (d) drops[laneId] = d;
  else delete drops[laneId];
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const EMPTY: Record<string, LaneDrop> = {};
export const useDrops = () => useSyncExternalStore(subscribe, () => drops, () => EMPTY);

/** What each analyzer can read. A file it cannot read is turned away before it is uploaded. */
export const takes = (a: LaneAnalyzer, f: File) => f.type.startsWith("image/") || (a === "objects" && f.type.startsWith("video/"));
export const ACCEPT: Record<LaneAnalyzer, string> = { objects: "image/*,video/*", body: "image/*", screen: "image/*" };

/**
 * Upload the files one after another. A check-in lane is one photo a day: a single photo is today's, and
 * several at once each go on the day of the file, so a folder of past photos lands on the right days.
 */
async function send(lane: StudioLane, files: File[], refresh: () => void) {
  if (drops[lane.id] && !drops[lane.id].error) return;
  const ok = files.filter((f) => takes(lane.analyzer, f));
  const skipped = files.length - ok.length;
  const why = skipped ? `This lane takes ${ANALYZER_LABEL[lane.analyzer].files.toLowerCase()}; skipped ${skipped} file${skipped === 1 ? "" : "s"}.` : undefined;
  if (!ok.length) return set(lane.id, { name: "", pct: 0, left: 0, error: why });
  const today = localDay();
  for (const [i, file] of ok.entries()) {
    const takenOn = lane.analyzer !== "body" ? undefined : ok.length === 1 ? today : [localDay(new Date(file.lastModified)), today].sort()[0];
    try {
      await uploadToLane(file, { laneId: lane.id, takenOn }, ({ pct, step }) => set(lane.id, { name: file.name, pct, step, left: ok.length - i - 1 }), refresh);
    } catch (e) {
      return set(lane.id, { name: file.name, pct: 0, left: 0, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }
  set(lane.id, why ? { name: "", pct: 0, left: 0, error: why } : null);
  refresh();
}

export function useSend() {
  const router = useRouter();
  return (lane: StudioLane, files: FileList | File[] | null | undefined) => {
    if (files?.length) void send(lane, [...files], () => router.refresh());
  };
}

export const hasFiles = (e: React.DragEvent | DragEvent) => !!e.dataTransfer?.types.includes("Files");

// ── the rows in the Sources dock ────────────────────────────────────────

export function Progress({ d }: { d: LaneDrop }) {
  if (d.error) return <span className="flex items-start gap-1 text-[10px] text-destructive"><CircleAlert className="mt-px size-3 shrink-0" />{d.error}</span>;
  return (
    <span className="grid gap-0.5">
      <span className="flex justify-between gap-2 font-mono text-[10px] text-electric">
        <span className="truncate">{d.step ?? d.name}</span>
        <span className="shrink-0">{d.pct}%{d.left ? ` · ${d.left} more` : ""}</span>
      </span>
      <span className="h-0.5 bg-muted"><span className="block h-full bg-electric transition-[width]" style={{ width: `${d.pct}%` }} /></span>
    </span>
  );
}

function LiveRow({ lane }: { lane: StudioLane }) {
  const Icon = INPUT_ICON[lane.input];
  return (
    <li className="border-l-2 border-transparent px-2 py-1.5 hover:bg-accent/40">
      <button type="button" onClick={() => openStudioWindow("lanes")} className="flex w-full items-center gap-2 text-left" title="Open the lane">
        <span className="grid size-7 shrink-0 place-items-center bg-muted text-muted-foreground"><Icon className="size-3.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{lane.name}</span>
          <span className="block truncate font-mono text-[10px] text-muted-foreground">
            {INPUT_LABEL[lane.input].name} · {lane.live?.ready ? (lane.live.last ? `last data ${lane.live.last}` : "waiting for data") : <span className="text-electric">needs setup</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function LaneRow({ lane, drop, over: forced }: { lane: StudioLane; drop?: LaneDrop; over?: boolean }) {
  const go = useSend();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hot = forced ?? over;
  return (
    <li
      onDragOver={(e) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); go(lane, e.dataTransfer.files); }}
      className={cn("border-l-2 px-2 py-1.5 transition-colors", hot ? "border-electric bg-electric/15" : drop && !drop.error ? "border-electric/60" : "border-transparent hover:bg-accent/40")}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden bg-muted text-muted-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element -- the owner's own latest photo in this lane */}
          {lane.thumb ? <img src={lane.thumb} alt="" className="size-full object-cover" /> : <FolderOpen className="size-3.5" />}
        </span>
        <button type="button" onClick={() => openStudioWindow("lanes")} className="min-w-0 flex-1 text-left" title="Open the lane">
          <span className="block truncate">{lane.name}</span>
          <span className="flex items-center gap-1.5 truncate font-mono text-[10px] text-muted-foreground">
            {hot ? <span className="text-electric">Drop to add</span> : <>
              {lane.files} file{lane.files === 1 ? "" : "s"}
              {lane.reading > 0 && <span className="inline-flex items-center gap-0.5 text-electric"><Loader2 className="size-2.5 animate-spin" />{lane.reading} reading</span>}
            </>}
          </span>
        </button>
        <button type="button" onClick={() => input.current?.click()} disabled={!!drop && !drop.error} aria-label={`Add files to ${lane.name}`} title="Add files" className="grid size-6 shrink-0 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40">
          <FileUp className="size-3.5" />
        </button>
        <input ref={input} type="file" multiple hidden accept={ACCEPT[lane.analyzer]} onChange={(e) => { go(lane, e.target.files); e.target.value = ""; }} />
      </div>
      {drop && <div className="mt-1 pl-9"><Progress d={drop} /></div>}
    </li>
  );
}

/** The lanes at the top of the Sources dock. Each row takes dropped files; `preview` fixes the drops for /design. */
export function LaneDropList({ lanes, preview }: { lanes: StudioLane[]; preview?: { drops?: Record<string, LaneDrop>; over?: string } }) {
  const live = useDrops();
  const now = preview?.drops ?? live;
  if (!lanes.length) {
    return (
      <button type="button" onClick={() => openStudioWindow("lanes")} className="m-2 flex w-[calc(100%-1rem)] flex-col items-center gap-1 border border-dashed px-2 py-3 text-[11px] text-muted-foreground hover:border-electric hover:text-foreground">
        <Plus className="size-3.5" />Make a lane first: files, a screen, a sensor or a feed
      </button>
    );
  }
  return (
    <ul className="py-0.5 text-xs">
      {lanes.map((l) => (l.input === "files" ? <LaneRow key={l.id} lane={l} drop={now[l.id]} over={preview ? preview.over === l.id : undefined} /> : <LiveRow key={l.id} lane={l} />))}
    </ul>
  );
}

// ── the overlay over the whole studio ───────────────────────────────────

/**
 * While files are dragged over the studio, every lane shows as a big tile to drop on. Windows (dialogs)
 * keep their own drop zones, so a drag inside one is left alone. `preview` shows it fixed in /design.
 */
export function StudioDropZone({ lanes, preview }: { lanes: StudioLane[]; preview?: { over?: string } }) {
  const [shown, setShown] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const depth = useRef(0);
  const go = useSend();

  useEffect(() => {
    if (preview) return;
    const inWindow = (e: DragEvent) => e.target instanceof Element && !!e.target.closest('[role="dialog"]');
    const close = () => {
      depth.current = 0;
      setShown(false);
      setOver(null);
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e) || inWindow(e)) return;
      depth.current++;
      setShown(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e) || inWindow(e)) return;
      if (--depth.current <= 0) close();
    };
    // Dropped on nothing: keep the browser from opening the file in place of the studio.
    const over = (e: DragEvent) => { if (hasFiles(e) && !inWindow(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (hasFiles(e) && !inWindow(e)) e.preventDefault();
      close();
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [preview]);

  if (!preview && !shown) return null;
  const targets = lanes.filter((l) => l.input === "files");
  const hot = preview ? preview.over : over;
  const done = () => {
    depth.current = 0;
    setShown(false);
    setOver(null);
  };
  return (
    <div onDrop={targets.length ? undefined : () => openStudioWindow("lanes")} className={cn("z-50 grid place-items-center bg-background/85 p-6 backdrop-blur-sm", preview ? "relative min-h-[26rem]" : "fixed inset-0")}>
      <div className="w-full max-w-3xl">
        <p className="text-center font-mono text-[10px] uppercase tracking-wider text-electric">Drop into a lane</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">{targets.length ? "Each lane is read by its own analyzer and feeds its own products." : "This project has no lane for files yet. Make one first, then drop your files on it."}</p>
        {targets.length ? (
          <ul className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
            {targets.map((l) => (
              <li
                key={l.id}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(l.id); }}
                onDragLeave={() => setOver((o) => (o === l.id ? null : o))}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); done(); go(l, e.dataTransfer.files); }}
                className={cn("flex min-h-32 flex-col justify-between gap-3 border-2 border-dashed bg-card p-4 transition-all", hot === l.id ? "scale-[1.03] border-electric bg-electric/10" : "border-border")}
              >
                <span className="flex items-start gap-2">
                  <FolderOpen className={cn("mt-0.5 size-4 shrink-0", hot === l.id ? "text-electric" : "text-muted-foreground")} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.name}</span>
                    <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ANALYZER_LABEL[l.analyzer].name}</span>
                  </span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{hot === l.id ? <span className="text-electric">Let go to add</span> : `${ANALYZER_LABEL[l.analyzer].files} · ${l.files} so far`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 grid place-items-center">
            <button type="button" onClick={() => { done(); openStudioWindow("lanes"); }} className="flex items-center gap-1.5 border-2 border-dashed border-electric px-6 py-8 text-sm text-electric">
              <Plus className="size-4" />Make a lane
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
