import { normalizeAudio } from "@/sources/browser-audio";
import { sampleVideo } from "@/sources/browser-video";
import { isVideoFile } from "@/sources/video-plan";

/** One file into one lane, from the browser: create, PUT to storage, confirm, then sample frames if it is a video. */

export type UploadStage = "preparing" | "uploading" | "sampling";
export type UploadStep = { pct: number; step?: string; stage?: UploadStage; n?: number; total?: number };
const CANCELLED = "Cancelled";
const FRAME_TIMEOUT_MS = 30_000;

/** A day on the person's own calendar, not the server's. Today by default. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function errorOf(res: Response, fallback: string) {
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;
}

// PUT with progress; fetch can't report upload progress.
function putFile(url: string, file: File, onProgress: (pct: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener("abort", () => { xhr.abort(); reject(new Error(CANCELLED)); }, { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Storage returned ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(file);
  });
}

/** Sample a confirmed video right here in the browser and send each frame; the report goes to the observatory. */
async function sendFrames(id: string, file: File, onProgress: (done: number, total: number) => void, signal?: AbortSignal, have?: ReadonlySet<number>) {
  const url = `/api/uploads/${id}/frames`;
  const report = (body: object) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const r = await sampleVideo(file, async ({ atMs, jpeg, total }) => {
      // A frame that gets no answer fails with a message instead of leaving the bar still.
      const res = await fetch(url, { method: "POST", headers: { "content-type": "image/jpeg", "x-at-ms": String(atMs), "x-frames-total": String(total) }, body: jpeg, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(FRAME_TIMEOUT_MS)]) : AbortSignal.timeout(FRAME_TIMEOUT_MS) }).catch((e: unknown) => {
        throw new Error(signal?.aborted ? CANCELLED : e instanceof DOMException && e.name === "TimeoutError" ? `Frame at ${Math.round(atMs / 1000)} s got no answer from ARGUS after ${FRAME_TIMEOUT_MS / 1000} s` : "A frame could not be sent");
      });
      if (!res.ok && res.status !== 429) throw new Error(await errorOf(res, "A frame could not be sent"));
    }, onProgress, signal, have);
    await report(r);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not sample this video";
    await report({ error, decoder: "HTMLVideoElement + canvas (browser)" }).catch(() => {});
    throw new Error(error);
  }
}

/** `onStored` runs once the file is confirmed, before any frame sampling, so the studio can show it arriving. */
export async function uploadToLane(file: File, { laneId, takenOn, speech, signal }: { laneId: string; takenOn?: string; speech?: boolean; signal?: AbortSignal }, onProgress: (s: UploadStep) => void, onStored?: () => void) {
  let audioReport: { ms: number; bytes: number } | undefined;
  if (speech || /\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(file.name)) {
    onProgress({ pct: 0, step: "Preparing mono WAV in your browser", stage: "preparing" });
    const start = performance.now();
    file = await normalizeAudio(file);
    audioReport = { ms: Math.round(performance.now() - start), bytes: file.size };
  }
  onProgress({ pct: 0, stage: "uploading" });
  const create = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, laneId, ...(takenOn ? { takenOn } : {}) }),
  });
  if (!create.ok) throw new Error(await errorOf(create, "Could not start upload"));
  const { upload, url } = (await create.json()) as { upload: { id: string }; url: string };

  await putFile(url, file, (pct) => onProgress({ pct, stage: "uploading" }), signal);

  const done = await fetch(`/api/uploads/${upload.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ audioReport }) });
  if (!done.ok) throw new Error(await errorOf(done, "Upload could not be confirmed"));
  onStored?.();
  if (isVideoFile(file.name)) {
    await sendFrames(upload.id, file, (n, total) => onProgress({ pct: total ? Math.round((n / total) * 100) : 0, step: `Sampling frames in your browser · ${n}/${total}`, stage: "sampling", n, total }), signal);
  }
}

/**
 * Carry on sampling a video that stopped half way. Asks the server which seconds it already has and sends only
 * the rest, so nothing is stored or analysed twice. `file` is the original if the person picked it again;
 * otherwise the stored copy is read back from storage.
 */
export async function continueSampling(id: string, mediaUrl: string, name: string, onProgress: (s: UploadStep) => void, signal?: AbortSignal, file?: File) {
  const got = await fetch(`/api/uploads/${id}/frames`, { signal });
  if (!got.ok) throw new Error(await errorOf(got, "Could not tell which frames are already stored"));
  const { have } = (await got.json()) as { have: number[] };
  if (!file) {
    onProgress({ pct: 0, step: "Fetching the stored video", stage: "sampling" });
    const res = await fetch(mediaUrl, { signal }).catch(() => null);
    if (!res?.ok) throw new Error("Could not read the stored video back. Choose the same file again to continue.");
    file = new File([await res.blob()], name, { type: res.headers.get("content-type") ?? "video/mp4" });
  }
  await sendFrames(id, file, (n, total) => onProgress({ pct: total ? Math.round((n / total) * 100) : 0, step: `Sampling frames in your browser · ${n}/${total}`, stage: "sampling", n, total }), signal, new Set(have));
}
