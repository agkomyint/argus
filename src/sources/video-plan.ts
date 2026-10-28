// Shared by the browser sampler and the server, so both agree on which seconds of a video are looked at.

export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm"];
export const FRAME_EVERY_MS = 2000;
export const MAX_FRAMES = 60;
export const FRAME_MAX_WIDTH = 960;

export const isVideoFile = (filename: string) => VIDEO_EXTENSIONS.includes(filename.split(".").pop()?.toLowerCase() ?? "");

/** Every 2 s, spaced further apart for long clips so no clip goes past MAX_FRAMES. */
export function framePlan(durationMs: number) {
  const everyMs = Math.max(FRAME_EVERY_MS, Math.ceil(durationMs / MAX_FRAMES / 100) * 100);
  const count = durationMs > 0 ? Math.min(MAX_FRAMES, Math.floor((durationMs - 1) / everyMs) + 1) : 0;
  return { everyMs, count, atMs: Array.from({ length: count }, (_, i) => i * everyMs) };
}

/** 00:42 or 1:02:05. */
export function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}
