"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorOf } from "@/components/workspace/lane-upload";

export type CameraState = "idle" | "starting" | "live" | "saving" | "error";

/** One camera session = one upload; sampled JPEGs use the existing vision pipeline while recording. */
export function CameraLane({ laneId, preview = false, previewState = "idle" }: { laneId: string; preview?: boolean; previewState?: CameraState }) {
  const router = useRouter();
  const [state, setState] = useState<CameraState>(previewState);
  const [error, setError] = useState("");
  const [frames, setFrames] = useState(0);
  const [download, setDownload] = useState("");
  const [recording, setRecording] = useState<File | null>(null);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download); }, [download]);
  const video = useRef<HTMLVideoElement>(null);
  const resources = useRef<{ stream?: MediaStream; recorder?: MediaRecorder; timer?: ReturnType<typeof setInterval>; deadline?: ReturnType<typeof setTimeout>; cancelled: boolean }>({ cancelled: false });
  const session = useRef<{ id: string; url: string } | null>(null);
  useEffect(() => {
    const r = resources.current;
    r.cancelled = false;
    return () => {
      r.cancelled = true;
      clearInterval(r.timer); clearTimeout(r.deadline);
      if (r.recorder?.state === "recording") r.recorder.stop();
      r.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function save(file: File) {
    if (!session.current) return;
    setState("saving"); setRecording(file); setDownload(URL.createObjectURL(file));
    try {
      const put = await fetch(session.current.url, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!put.ok) throw new Error("Could not save the recording. Retry while this window is open.");
      const done = await fetch(`/api/uploads/${session.current.id}/complete`, { method: "POST" });
      if (!done.ok) throw new Error(await errorOf(done, "Could not confirm recording"));
      setRecording(null); setDownload(""); setState("idle"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Recording could not be saved"); setState("error"); }
  }

  async function start() {
    if (preview) return;
    const r = resources.current;
    setState("starting"); setError(""); setFrames(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Camera recording needs a supported browser on HTTPS or localhost.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, facingMode: "environment" }, audio: false });
      if (r.cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      r.stream = stream;
      const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error("This browser cannot record a supported video format.");
      const type = mime.split(";")[0];
      const filename = `camera-${Date.now()}.${type === "video/mp4" ? "mp4" : "webm"}`;
      const create = await fetch("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename, contentType: type, size: 1, laneId }) });
      if (!create.ok) throw new Error(await errorOf(create, "Could not start camera session"));
      const data = await create.json() as { upload: { id: string }; url: string };
      session.current = { id: data.upload.id, url: data.url };
      if (r.cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      if (!video.current) throw new Error("Camera preview is unavailable");
      video.current.srcObject = stream; await video.current.play();
      const chunks: Blob[] = [];
      const started = performance.now(); let busy = false; let count = 0; let sampleError: string | undefined;
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_000_000 }); r.recorder = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        clearInterval(r.timer); clearTimeout(r.deadline);
        void fetch(`/api/uploads/${data.upload.id}/frames`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ frames: count, error: sampleError, durationMs: Math.round(performance.now() - started), everyMs: 5000, decoder: "getUserMedia + canvas + MediaRecorder" }) }).catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
        if (!r.cancelled) void save(new File(chunks, filename, { type }));
      };
      recorder.onerror = () => { setError("The camera stopped unexpectedly. Saving what was recorded."); if (recorder.state === "recording") recorder.stop(); };
      recorder.start(1000); setState("live");
      const sample = async () => {
        if (busy || recorder.state !== "recording" || !video.current?.videoWidth) return;
        busy = true;
        try {
          const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = Math.round(960 * video.current.videoHeight / video.current.videoWidth);
          canvas.getContext("2d")!.drawImage(video.current, 0, 0, canvas.width, canvas.height);
          const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
          if (!jpeg) throw new Error("Could not sample the camera");
          const res = await fetch(`/api/uploads/${data.upload.id}/frames`, { method: "POST", headers: { "content-type": "image/jpeg", "x-at-ms": String(Math.round(performance.now() - started)) }, body: jpeg });
          if (!res.ok) throw new Error(await errorOf(res, "Camera frame could not be sent"));
          count++; setFrames(count); router.refresh();
        } catch (e) {
          sampleError = e instanceof Error ? e.message : "Camera sampling failed";
          setError(sampleError);
          if (recorder.state === "recording") recorder.stop();
        } finally { busy = false; }
      };
      void sample(); r.timer = setInterval(() => void sample(), 5000);
      r.deadline = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 60_000);
      stream.getVideoTracks()[0].onended = () => { if (recorder.state === "recording") recorder.stop(); };
    } catch (e) {
      r.stream?.getTracks().forEach((t) => t.stop());
      setError(e instanceof Error ? e.message : "Camera could not start"); setState("error");
    }
  }

  return <section className="grid gap-3 border p-3">
    <div className="relative aspect-video overflow-hidden bg-muted">
      <video ref={video} muted playsInline className="size-full object-contain" aria-label="Live camera preview" />
      {state !== "live" && <div className="absolute inset-0 grid place-content-center gap-2 text-center text-sm text-muted-foreground"><Camera className="mx-auto size-6" aria-hidden /><span>{state === "starting" ? "Waiting for camera permission…" : state === "saving" ? "Saving your recording…" : "Camera is off"}</span></div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="font-mono text-xs text-muted-foreground">{state === "live" ? `Recording · ${frames} frames sent` : "60-second sessions · one frame every 5 seconds · no audio"}</p>
      {state === "live" ? <Button onClick={() => resources.current.recorder?.stop()} className="min-h-10 gap-2"><Square className="size-4" />Stop and save</Button> : <Button className="min-h-10 gap-2" disabled={preview || state === "starting" || state === "saving"} onClick={() => recording ? void save(recording) : void start()}><Camera className="size-4" />{recording ? "Retry save" : "Start camera"}</Button>}
    </div>
    {(error || state === "error") && <p role="alert" className="text-sm text-destructive">{error || "Camera permission was denied. Allow camera access in your browser, then try again."}</p>}
    <p className="text-xs text-muted-foreground">Frames feed Muse Spark and your enabled vision products during capture. The recording is saved for replay when you stop. Keep this window open until saving finishes.</p>
    {recording && <a className="text-sm text-electric underline focus-visible:ring-2 focus-visible:ring-ring" href={download} download={recording.name}>Download recording</a>}
  </section>;
}
