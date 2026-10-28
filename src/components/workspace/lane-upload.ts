import { sampleVideo } from "@/sources/browser-video";
import { isVideoFile } from "@/sources/video-plan";

/** One file into one lane, from the browser: create, PUT to storage, confirm, then sample frames if it is a video. */

export type UploadStep = { pct: number; step?: string };

/** A day on the person's own calendar, not the server's. Today by default. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function errorOf(res: Response, fallback: string) {
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;
}

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

/** Sample a confirmed video right here in the browser and send each frame; the report goes to the observatory. */
async function sendFrames(id: string, file: File, onProgress: (done: number, total: number) => void) {
  const url = `/api/uploads/${id}/frames`;
  const report = (body: object) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const r = await sampleVideo(file, async ({ atMs, jpeg }) => {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "image/jpeg", "x-at-ms": String(atMs) }, body: jpeg });
      if (!res.ok && res.status !== 429) throw new Error(await errorOf(res, "A frame could not be sent"));
    }, onProgress);
    await report(r);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not sample this video";
    await report({ error, decoder: "HTMLVideoElement + canvas (browser)" }).catch(() => {});
    throw new Error(error);
  }
}

/** `onStored` runs once the file is confirmed, before any frame sampling, so the studio can show it arriving. */
export async function uploadToLane(file: File, { laneId, takenOn }: { laneId: string; takenOn?: string }, onProgress: (s: UploadStep) => void, onStored?: () => void) {
  onProgress({ pct: 0 });
  const create = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, laneId, ...(takenOn ? { takenOn } : {}) }),
  });
  if (!create.ok) throw new Error(await errorOf(create, "Could not start upload"));
  const { upload, url } = (await create.json()) as { upload: { id: string }; url: string };

  await putFile(url, file, (pct) => onProgress({ pct }));

  const done = await fetch(`/api/uploads/${upload.id}/complete`, { method: "POST" });
  if (!done.ok) throw new Error(await errorOf(done, "Upload could not be confirmed"));
  onStored?.();
  if (isVideoFile(file.name)) {
    await sendFrames(upload.id, file, (n, total) => onProgress({ pct: total ? Math.round((n / total) * 100) : 0, step: `Sampling frames in your browser · ${n}/${total}` }));
  }
}
