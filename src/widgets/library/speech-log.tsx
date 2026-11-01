"use client";
import { Empty } from "@/components/widgets/empty";
import { clock } from "@/sources/video-plan";
import type { WidgetProps } from "@/widgets/schema";

export function SpeechLog({ rows, size }: WidgetProps) {
  const turns = rows.filter((r) => r.type === "transcript_turn").slice(size === "compact" ? -3 : -100);
  if (!turns.length) return <Empty text="No speech yet. Add an audio file to a Transcribe speech lane." />;
  return <ol className="divide-y border text-sm">{turns.map((r, i) => <li key={String(r.observation_id ?? `${r.t}-${i}`)} className="grid gap-1 p-3">
    <span className="font-mono text-xs text-muted-foreground">{clock(Number(r.at_ms ?? 0))}–{clock(Number(r.end_ms ?? 0))} · Speaker {String(r.speaker ?? "Unknown")}</span>
    <p className="whitespace-pre-wrap break-words">{String(r.text ?? "")}</p>
  </li>)}</ol>;
}
