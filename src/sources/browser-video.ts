import { FRAME_MAX_WIDTH, framePlan } from "./video-plan";

/**
 * Sample a video in the browser with the browser's own decoder: a hidden <video> seeks to each planned
 * second and a <canvas> turns it into a JPEG. No ffmpeg on the server and no wasm download.
 */

export type SampleReport = { durationMs: number; width: number; height: number; everyMs: number; frames: number; ms: number; decoder: string };

const DECODER = "HTMLVideoElement + canvas (browser)";

function once(el: HTMLVideoElement, event: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const ok = () => { off(); resolve(); };
    const bad = () => { off(); reject(new Error("This browser cannot decode this video. Try an H.264 .mp4 or a .webm")); };
    const off = () => { el.removeEventListener(event, ok); el.removeEventListener("error", bad); };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}

export async function sampleVideo(
  file: File,
  onFrame: (frame: { atMs: number; jpeg: Blob }) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<SampleReport> {
  const t0 = performance.now();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
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
    for (const [i, atMs] of plan.atMs.entries()) {
      const seeked = once(video, "seeked");
      video.currentTime = Math.min(atMs / 1000, Math.max(0, video.duration - 0.05));
      await seeked;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
      if (!jpeg) throw new Error("Could not encode a frame");
      await onFrame({ atMs, jpeg });
      onProgress?.(i + 1, plan.count);
    }
    return { durationMs, width: video.videoWidth, height: video.videoHeight, everyMs: plan.everyMs, frames: plan.count, ms: Math.round(performance.now() - t0), decoder: DECODER };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
