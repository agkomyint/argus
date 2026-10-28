"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { localDay as localToday, uploadToLane } from "./lane-upload";

export type UploadRow = { id: string; filename: string; size: number; status: "pending" | "ready"; createdAt: string; takenOn?: string | null };

/**
 * Files only go in through a lane: a fixed `laneId`, or a pick from `lanes`. With neither this is a read-only list.
 * `daily` is for check-in lanes: each file belongs to a day (today unless the person picks another), and a
 * second photo for the same day replaces the first in the products.
 */
export function UploadPanel({ uploads, laneId: fixed, lanes, daily, list = true }: { uploads: UploadRow[]; laneId?: string; lanes?: { id: string; name: string }[]; daily?: boolean; list?: boolean }) {
  const [day, setDay] = useState("");
  const [picked, setPicked] = useState(lanes?.[0]?.id ?? "");
  const laneId = fixed ?? (picked || undefined);
  const router = useRouter();
  const [progress, setProgress] = useState<{ name: string; pct: number; step?: string } | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError("");
    setProgress({ name: file.name, pct: 0 });
    try {
      if (!laneId) return;
      await uploadToLane(file, { laneId, takenOn: daily ? day || localToday() : undefined }, ({ pct, step }) => setProgress({ name: file.name, pct, step }), () => router.refresh());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!fixed && lanes && lanes.length > 0 && (
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Upload into lane</span>
          <select value={picked} onChange={(e) => setPicked(e.target.value)} className="mt-1 w-full border bg-background px-2 py-1.5">
            {lanes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      {laneId && daily && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">Photo for</span>
          <input type="date" value={day} max={localToday()} onChange={(e) => setDay(e.target.value)} className="border bg-background px-2 py-1 font-mono text-xs [color-scheme:dark]" aria-label="Day this photo belongs to" />
          {!day && <span className="font-mono text-xs text-electric">today</span>}
          {day && <button type="button" onClick={() => setDay("")} className="text-xs text-muted-foreground underline-offset-2 hover:underline">use today</button>}
        </label>
      )}
      {laneId && <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        disabled={!!progress}
        className={cn(
          "flex w-full flex-col items-center gap-1 border border-dashed px-3 py-8 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60",
          dragging && "border-electric text-foreground",
        )}
      >
        <FileUp className="size-5" />
        {daily ? "Drop today's photo or click to upload" : "Drop a file or click to upload"}
        <span className="font-mono text-xs">{daily ? "jpg · png · webp · private to you, never in a public replay" : "video · image · csv · xlsx · json · geojson · parquet · pdf, up to 500 MB"}</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      </>}

      {progress && (
        <div>
          <div className="flex justify-between font-mono text-xs">
            <span className="truncate">{progress.step ?? progress.name}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="mt-1 h-1 bg-muted">
            <div className="h-full bg-electric transition-[width]" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {!list ? null : uploads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4 font-normal">File</th>
              <th className="py-2 pr-4 font-normal">Size</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {uploads.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="max-w-0 truncate py-3 pr-4">
                  {u.status === "ready" ? (
                    <a href={`/api/uploads/${u.id}`} className="hover:underline">{u.filename}</a>
                  ) : (
                    <span className="text-muted-foreground">{u.filename}</span>
                  )}
                  {u.takenOn && <span className="ml-2 font-mono text-[11px] text-electric">{u.takenOn}</span>}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{formatSize(u.size)}</td>
                <td className="py-3 pr-4 font-mono text-xs">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", u.status === "ready" ? "bg-signal" : "bg-muted-foreground/50")} aria-hidden />
                    {u.status === "ready" ? "Ready" : "Incomplete"}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <button type="button" onClick={() => remove(u.id)} aria-label={`Delete ${u.filename}`} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
