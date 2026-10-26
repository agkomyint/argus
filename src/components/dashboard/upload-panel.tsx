"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";

export type UploadRow = { id: string; filename: string; size: number; status: "pending" | "ready"; createdAt: string };

// PUT with progress; fetch can't report upload progress.
function putFile(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Storage returned ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(file);
  });
}

async function errorOf(res: Response, fallback: string) {
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;
}

/** Files only go in through a lane: a fixed `laneId`, or a pick from `lanes`. With neither this is a read-only list. */
export function UploadPanel({ uploads, laneId: fixed, lanes }: { uploads: UploadRow[]; laneId?: string; lanes?: { id: string; name: string }[] }) {
  const [picked, setPicked] = useState(lanes?.[0]?.id ?? "");
  const laneId = fixed ?? (picked || undefined);
  const router = useRouter();
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError("");
    setProgress({ name: file.name, pct: 0 });
    try {
      const create = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, laneId }),
      });
      if (!create.ok) throw new Error(await errorOf(create, "Could not start upload"));
      const { upload, url } = (await create.json()) as { upload: { id: string }; url: string };

      await putFile(url, file, (pct) => setProgress({ name: file.name, pct }));

      const done = await fetch(`/api/uploads/${upload.id}/complete`, { method: "POST" });
      if (!done.ok) throw new Error(await errorOf(done, "Upload could not be confirmed"));
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
        Drop a file or click to upload
        <span className="font-mono text-xs">video · image · csv · xlsx · json · geojson · parquet · pdf, up to 500 MB</span>
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
            <span className="truncate">{progress.name}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="mt-1 h-1 bg-muted">
            <div className="h-full bg-electric transition-[width]" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {uploads.length === 0 ? (
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
