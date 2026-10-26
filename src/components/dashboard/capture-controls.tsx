"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AutoRefresh } from "@/components/dashboard/pipeline-controls";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Status = "idle" | "running" | "paused";
const INTERVALS = [5, 10, 30, 60] as const;
const MAX_FRAMES = 1000;

/** Share a screen, sample a frame every N seconds, send each to the queue. Start, pause and stop are all here. */
export function CaptureControls({ queued, perFrame, every = 10 }: { queued: number; perFrame: number; every?: number }) {
  const [status, setStatus] = useState<Status>("idle");
  const [interval, setIntervalS] = useState<number>(every);
  const [sent, setSent] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const session = useRef<string>("");
  const statusRef = useRef<Status>("idle");
  const sentRef = useRef(0);
  const set = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };

  const stop = useCallback(async (discard: boolean) => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    video.current = null;
    set("idle");
    if (discard && session.current) {
      const r = await fetch("/api/capture/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: session.current }) })
        .then((x) => x.json())
        .catch(() => null);
      setNote(r ? `Stopped. ${r.discarded} waiting frame${r.discarded === 1 ? "" : "s"} discarded.` : "Stopped.");
    } else {
      setNote("Stopped. Frames already waiting will still finish.");
    }
  }, []);

  const grab = useCallback(async () => {
    const v = video.current;
    if (statusRef.current !== "running" || !v || !v.videoWidth) return;
    const scale = Math.min(1, 1280 / v.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.7));
    if (!blob) return;
    const res = await fetch("/api/capture/frame", {
      method: "POST",
      headers: { "content-type": "image/jpeg", "x-session": session.current, "x-captured-at": String(Date.now()) },
      body: blob,
    }).catch(() => null);
    if (res?.ok) {
      sentRef.current++;
      setSent(sentRef.current);
      setNote(null);
    } else if (res?.status === 423) {
      set("paused");
      setNote("This source is paused in ARGUS. Resume it on the source to keep capturing.");
    } else if (res?.status === 429) {
      setSkipped((n) => n + 1);
      setNote("The queue is full, so this frame was skipped. Use a longer interval.");
    } else {
      setNote(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not send a frame");
    }
    if (sentRef.current >= MAX_FRAMES) void stop(false);
  }, [stop]);

  // Sampling timer: runs only while capturing; changing the interval restarts it.
  useEffect(() => {
    if (status !== "running") return;
    void grab();
    const t = setInterval(() => void grab(), interval * 1000);
    return () => clearInterval(t);
  }, [status, interval, grab]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2 }, audio: false });
      stream.current = s;
      const v = document.createElement("video");
      v.srcObject = s;
      v.muted = true;
      await v.play();
      video.current = v;
      session.current = crypto.randomUUID();
      sentRef.current = 0;
      setSent(0);
      setSkipped(0);
      setNote(null);
      // The browser's own "Stop sharing" button ends the track too.
      s.getVideoTracks()[0].addEventListener("ended", () => void stop(false));
      set("running");
    } catch {
      setNote("Screen sharing was cancelled or is not allowed in this browser.");
    }
  }

  const perHour = (3600 / interval) * perFrame;
  return (
    <div className="border p-5">
      <AutoRefresh active={status !== "idle" || queued > 0} everyMs={4000} />
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider", status === "running" ? "text-signal" : status === "paused" ? "text-electric" : "text-muted-foreground")}>
          <span className={cn("size-2", status === "running" ? "animate-pulse bg-signal" : status === "paused" ? "bg-electric" : "bg-muted-foreground")} />
          {status === "idle" ? "Not sharing" : status === "running" ? "Capturing" : "Paused"}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {sent} sent · {queued} in queue{skipped ? ` · ${skipped} skipped` : ""}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {status === "idle" ? (
          <Button onClick={() => void start()} disabled={!consent}>Share screen</Button>
        ) : (
          <>
            {status === "running" ? <Button variant="outline" onClick={() => set("paused")}>Pause</Button> : <Button onClick={() => set("running")}>Resume</Button>}
            <Button variant="destructive" onClick={() => void stop(false)}>Stop</Button>
            <Button variant="outline" onClick={() => void stop(true)}>Stop and discard queue</Button>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Frame every
          <select value={interval} onChange={(e) => setIntervalS(Number(e.target.value))} className="border bg-background px-2 py-1 text-foreground">
            {INTERVALS.map((n) => <option key={n} value={n}>{n}s</option>)}
          </select>
        </label>
        <span className="font-mono text-xs text-muted-foreground">about ${perHour.toFixed(2)} / hour (estimate)</span>
      </div>

      {status === "idle" && (
        <label className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I have the right to analyze what I share. Frames are sent for analysis and deleted afterwards; only counts are kept.</span>
        </label>
      )}
      {note && <p role="status" className="mt-3 text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
