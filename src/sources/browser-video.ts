import { FRAME_MAX_WIDTH, framePlan } from "./video-plan";

/**
 * Sample a video in the browser with the browser's own decoder: a hidden <video> seeks to each planned
 * second and a <canvas> turns it into a JPEG. No ffmpeg on the server and no wasm download.
 */

export type SampleReport = { durationMs: number; width: number; height: number; everyMs: number; frames: number; ms: number; decoder: string };

const DECODER = "HTMLVideoElement + canvas (browser)";

const WAIT_MS = 20_000;

// Waits for one event, or fails: a browser that never fires it must end in an error, not a bar stuck at 0%.
function once(el: HTMLVideoElement, event: "loadedmetadata" | "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const ok = () => { off(); resolve(); };
    const bad = () => { off(); reject(new Error("This browser cannot decode this video. Try an H.264 .mp4 or a .webm")); };
    const late = setTimeout(() => { off(); reject(new Error(`The browser stopped responding while reading this video (waited ${WAIT_MS / 1000}s for ${event}). Try an H.264 .mp4 or a .webm`)); }, WAIT_MS);
    const off = () => { clearTimeout(late); el.removeEventListener(event, ok); el.removeEventListener("error", bad); };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

export async function sampleVideo(
  file: File,
  onFrame: (frame: { atMs: number; jpeg: Blob; total: number }) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  /** Seconds the server already has: they count as done and are not decoded or sent again. */
  have: ReadonlySet<number> = new Set(),
): Promise<SampleReport> {
  const t0 = performance.now();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Browsers can stop decoding a video that is not in the page after a few seeks. Keep it there, invisible.
  Object.assign(video.style, { position: "fixed", left: "0", top: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(video);
  try {
    const meta = once(video, "loadedmetadata");
    video.src = url;
    await meta;
    const durationMs = Math.round(video.duration * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("Could not read how long this video is");
    const plan = framePlan(durationMs);

    const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser");

    onProgress?.(0, plan.count);
    // Metadata is not pixels: wait until the first frame is decoded, or the first drawImage is blank.
    if (video.readyState < 2) await once(video, "loadeddata");
    for (const [i, atMs] of plan.atMs.entries()) {
      if (signal?.aborted) throw new Error("Cancelled");
      if (have.has(atMs)) { onProgress?.(i + 1, plan.count); continue; }
      const target = Math.min(atMs / 1000, Math.max(0, video.duration - 0.05));
      // A seek to where the video already is fires no "seeked" in some browsers (the first frame, at 0 s).
      if (Math.abs(video.currentTime - target) > 0.001) {
        const seeked = once(video, "seeked");
        video.currentTime = target;
        await seeked;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
      if (!jpeg) throw new Error("Could not encode a frame");
      await onFrame({ atMs, jpeg, total: plan.count });
      onProgress?.(i + 1, plan.count);
    }
    return { durationMs, width: video.videoWidth, height: video.videoHeight, everyMs: plan.everyMs, frames: plan.count, ms: Math.round(performance.now() - t0), decoder: DECODER };
  } finally {
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}
