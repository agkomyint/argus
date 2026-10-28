"use client";

import { ArrowLeft, Check, CircleAlert, FileText, Film, Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LANE_ANALYZERS, LANE_INPUTS, type LaneAnalyzer, type LaneInput } from "@/lib/lane-kinds";
import { INPUT_ICON } from "@/components/studio/lane-drop";
import { Thinking } from "@/components/workspace/setup-steps";
import { UploadPanel } from "@/components/workspace/upload-panel";
import { openStudioWindow } from "@/components/studio/studio-window";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ANALYZER_LABEL, canFeed, INPUT_LABEL, laneFeeds, laneProblems, type SetupLane } from "@/lib/setup-rules";
import { formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The Lanes window. Everything comes into a project through a lane, and a lane is the first thing a person
 * makes: one kind of file they add again and again ("Front photo"), or one live input (a screen share, a
 * weather feed, a sensor, a webhook). They say what goes in it, ARGUS proposes the lane and the products it
 * feeds, code checks it, they confirm. Click a lane for its files or its live setup. Shown in /design STU-06.
 */

export type LaneFile = { id: string; filename: string; size: number; status: "pending" | "ready"; createdAt: string; takenOn?: string | null; read: "done" | "working" | "failed" | "waiting"; rows: number };
export type LaneData = { id: string; name: string; note: string; analyzer: LaneAnalyzer; input: LaneInput; ready?: boolean; feeds: string[]; files: LaneFile[] };
export type LaneProduct = { id: string; name: string };
export type LaneActions = {
  suggest: (words: string) => Promise<{ lane: SetupLane; problems: string[] } | { error: string }>;
  create: (lane: SetupLane) => Promise<{ error?: string; id?: string }>;
  setFeeds: (laneId: string, feeds: string[]) => Promise<void>;
  remove: (laneId: string) => Promise<void>;
};

export const LANE_SUGGEST_STEPS = [
  { name: "lanes.suggest_one", kind: "model" as const, text: "Naming the lane and picking what reads its files" },
  { name: "lanes.check_one", kind: "code" as const, text: "Checking each product it feeds can read that lane" },
];

type Phase = { at: "idle" } | { at: "writing"; words: string; error?: string } | { at: "thinking"; words: string } | { at: "draft"; lane: SetupLane; ai: boolean; error?: string };

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";
const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;

export function LaneBoard({ projectId, lanes, products, actions, setup, preview, start }: { projectId: string; lanes: LaneData[]; products: LaneProduct[]; actions: LaneActions; setup?: Record<string, React.ReactNode>; preview?: boolean; start?: { open?: string; phase?: Phase } }) {
  const [open, setOpen] = useState<string | null>(start?.open ?? null);
  const [phase, setPhase] = useState<Phase>(start?.phase ?? (lanes.length ? { at: "idle" } : { at: "writing", words: "" }));
  const [busy, startTransition] = useTransition();
  const lane = lanes.find((l) => l.id === open);
  const on = products.map((p) => p.id);
  const taken = lanes.map((l) => l.name);

  const suggest = (words: string) => {
    setPhase({ at: "thinking", words });
    startTransition(async () => {
      const r = await actions.suggest(words);
      setPhase("error" in r ? { at: "writing", words, error: r.error } : { at: "draft", lane: r.lane, ai: true });
    });
  };
  const create = (draft: SetupLane, ai: boolean) => {
    startTransition(async () => {
      const r = await actions.create(draft);
      if (r.error) return setPhase({ at: "draft", lane: draft, ai, error: r.error });
      setPhase({ at: "idle" });
      if (r.id) setOpen(r.id);
    });
  };

  if (lane) return <LaneDetail key={lane.id} projectId={projectId} lane={lane} products={products} actions={actions} setup={setup?.[lane.id]} preview={preview} onBack={() => setOpen(null)} />;

  return (
    <div className="@container grid gap-4">
      {phase.at === "idle" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Everything comes in through a lane: one kind of file, or one live input. Each lane feeds the products it links to.</p>
          <Button size="sm" className="gap-1.5" onClick={() => setPhase({ at: "writing", words: "" })}><Plus className="size-4" />New lane</Button>
        </div>
      ) : (
        <NewLane phase={phase} busy={busy} products={products} on={on} taken={taken} first={!lanes.length}
          onWords={(words) => setPhase({ at: "writing", words })}
          onSuggest={suggest}
          onManual={() => setPhase({ at: "draft", ai: false, lane: { name: "", note: "", input: "files", analyzer: firstAnalyzer(on), feeds: on.filter((id) => canFeed(firstAnalyzer(on), id)) } })}
          onDraft={(l) => phase.at === "draft" && setPhase({ ...phase, lane: l, error: undefined })}
          onCreate={() => phase.at === "draft" && create(phase.lane, phase.ai)}
          onCancel={lanes.length ? () => setPhase({ at: "idle" }) : undefined}
        />
      )}

      {lanes.length > 0 && (
        <ul className="grid gap-3 @xl:grid-cols-2">
          {lanes.map((l) => <LaneCard key={l.id} projectId={projectId} lane={l} products={products} preview={preview} onOpen={() => setOpen(l.id)} />)}
        </ul>
      )}
    </div>
  );
}

function firstAnalyzer(on: string[]): LaneAnalyzer {
  return LANE_ANALYZERS.find((a) => on.some((id) => canFeed(a, id))) ?? "objects";
}

function NewLane({ phase, busy, products, on, taken, first, onWords, onSuggest, onManual, onDraft, onCreate, onCancel }: {
  phase: Exclude<Phase, { at: "idle" }>; busy: boolean; products: LaneProduct[]; on: string[]; taken: string[]; first: boolean;
  onWords: (w: string) => void; onSuggest: (w: string) => void; onManual: () => void; onDraft: (l: SetupLane) => void; onCreate: () => void; onCancel?: () => void;
}) {
  if (phase.at === "thinking") {
    return (
      <section className="border border-electric/50">
        <p className="border-b px-4 py-2.5 text-sm">&ldquo;{phase.words}&rdquo;</p>
        <Thinking steps={LANE_SUGGEST_STEPS} current={0} />
      </section>
    );
  }
  if (phase.at === "writing") {
    const ok = phase.words.trim().length >= 2;
    return (
      <section className="grid gap-3 border p-4">
        <div>
          <p className="font-medium">{first ? "Make your first lane" : "New lane"}</p>
          <p className="text-sm text-muted-foreground">Say what comes in, in your own words: files you add again and again, or a live screen, weather, sensor or webhook. ARGUS names it, picks what reads it and links it to your products.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (ok) onSuggest(phase.words.trim()); }} className="flex flex-wrap gap-2">
          <Input autoFocus value={phase.words} onChange={(e) => onWords(e.target.value)} maxLength={300} placeholder="e.g. front pics of me every morning, or share my screen" className="h-10 min-w-0 flex-1 text-base" aria-label="What goes in this lane" />
          <Button type="submit" className="h-10 gap-1.5" disabled={!ok || busy}><Sparkles className="size-4" />Suggest lane</Button>
        </form>
        {phase.error && <p role="alert" className="text-sm text-destructive">{phase.error}</p>}
        <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <button type="button" onClick={onManual} className="underline hover:text-foreground">set it up yourself</button>
          {onCancel && <button type="button" onClick={onCancel} className="underline hover:text-foreground">cancel</button>}
        </p>
      </section>
    );
  }
  const l = phase.lane;
  const problems = laneProblems(l, on, taken);
  const can = products.filter((p) => laneFeeds(l, p.id));
  const input = l.input ?? "files";
  return (
    <section className="grid gap-3 border border-electric/50 p-4">
      <p className={cn(label, "flex items-center gap-1.5")}>{phase.ai ? <><Sparkles className="size-3 text-electric" />ARGUS suggests · check it, then make it</> : <><Wand2 className="size-3" />Your lane</>}</p>
      <Input aria-label="Lane name" value={l.name} onChange={(e) => onDraft({ ...l, name: e.target.value })} maxLength={60} placeholder="Lane name, e.g. Front photo" className="h-10 text-base font-medium" />
      <Textarea aria-label="What these files are" value={l.note} onChange={(e) => onDraft({ ...l, note: e.target.value })} maxLength={300} rows={2} placeholder={input === "files" ? "What these files are, for the AI" : "What this input is, in a sentence"} className="text-sm" />
      <InputPicker value={input} onPick={(i) => {
        const next = { ...l, input: i, analyzer: i === "files" ? l.analyzer : ("objects" as const) };
        onDraft({ ...next, feeds: on.filter((id) => laneFeeds(next, id)) });
      }} />
      {input === "files" && <AnalyzerPicker value={l.analyzer} onPick={(a) => onDraft({ ...l, analyzer: a, feeds: on.filter((id) => canFeed(a, id)) })} />}
      <FeedChips products={can} feeds={l.feeds} onToggle={(id) => onDraft({ ...l, feeds: l.feeds.includes(id) ? l.feeds.filter((x) => x !== id) : [...l.feeds, id] })} lane={l} />
      {(phase.error || problems.length > 0) && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{phase.error ?? problems[0]}</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onWords("")}>Start over</Button>
        {onCancel && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>}
        <Button type="button" size="sm" disabled={busy || problems.length > 0} onClick={onCreate}>{busy ? "Making…" : "Make lane"}</Button>
      </div>
    </section>
  );
}

function InputPicker({ value, onPick }: { value: LaneInput; onPick: (i: LaneInput) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={label}>Comes from</span>
        {LANE_INPUTS.map((i) => {
          const Icon = INPUT_ICON[i];
          return (
            <button key={i} type="button" aria-pressed={value === i} onClick={() => onPick(i)} className={cn("inline-flex items-center gap-1 border px-2 py-0.5 text-xs", value === i ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="size-3" />{INPUT_LABEL[i].name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{INPUT_LABEL[value].blurb}.</p>
    </div>
  );
}

function AnalyzerPicker({ value, onPick }: { value: LaneAnalyzer; onPick: (a: LaneAnalyzer) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={label}>Reads with</span>
        {LANE_ANALYZERS.map((a) => (
          <button key={a} type="button" aria-pressed={value === a} onClick={() => onPick(a)} className={cn("border px-2 py-0.5 text-xs", value === a ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}>{ANALYZER_LABEL[a].name}</button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{ANALYZER_LABEL[value].files}: {ANALYZER_LABEL[value].does}.</p>
    </div>
  );
}

function FeedChips({ products, feeds, onToggle, lane, pending }: { products: LaneProduct[]; feeds: string[]; onToggle: (id: string) => void; lane: { input?: LaneInput; analyzer: LaneAnalyzer }; pending?: boolean }) {
  const input = lane.input ?? "files";
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
      <span className={label}>Feeds</span>
      {products.map((p) => {
        const on = feeds.includes(p.id);
        return (
          <button key={p.id} type="button" aria-pressed={on} disabled={pending} onClick={() => onToggle(p.id)} className={cn("inline-flex items-center gap-1 border px-2 py-0.5 text-xs disabled:opacity-60", on ? "border-signal text-foreground" : "border-dashed text-muted-foreground hover:text-foreground")}>
            {on ? <Check className="size-3 text-signal" /> : <Plus className="size-3" />}{p.name}
          </button>
        );
      })}
      {!products.length && (
        <span className="text-xs text-muted-foreground">
          {input === "files" ? `No product in this project reads ${ANALYZER_LABEL[lane.analyzer].name.toLowerCase()} files.` : `No product in this project reads a ${INPUT_LABEL[input].name.toLowerCase()} yet; its rows are still kept.`}{" "}
          <button type="button" onClick={() => openStudioWindow("products")} className="text-electric hover:underline">Add one in Products</button>
        </span>
      )}
    </div>
  );
}

const media = (projectId: string, f: LaneFile) => `/api/studio/${projectId}/media/${f.id}`;

function Thumb({ projectId, f, preview, className }: { projectId: string; f: LaneFile; preview?: boolean; className?: string }) {
  const img = IMAGE.test(f.filename) && f.status === "ready" && !preview;
  return (
    <span className={cn("relative grid place-items-center overflow-hidden bg-muted text-muted-foreground", className)}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed redirect to the owner's own file
        <img src={media(projectId, f)} alt={f.filename} loading="lazy" className="size-full object-cover" />
      ) : VIDEO.test(f.filename) ? <Film className="size-4" /> : IMAGE.test(f.filename) ? <span className="font-mono text-[9px]">IMG</span> : <FileText className="size-4" />}
      {f.read === "working" && <span className="absolute inset-0 grid place-items-center bg-background/60"><Loader2 className="size-4 animate-spin text-electric" /></span>}
    </span>
  );
}

const READ_TEXT: Record<LaneFile["read"], string> = { done: "Read", working: "Reading…", failed: "Failed", waiting: "Waiting" };
const READ_DOT: Record<LaneFile["read"], string> = { done: "bg-signal", working: "bg-electric animate-pulse", failed: "bg-destructive", waiting: "bg-muted-foreground/50" };

function LaneCard({ projectId, lane, products, preview, onOpen }: { projectId: string; lane: LaneData; products: LaneProduct[]; preview?: boolean; onOpen: () => void }) {
  const working = lane.files.filter((f) => f.read === "working").length;
  const read = lane.files.filter((f) => f.read === "done").length;
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const live = lane.input !== "files";
  const Icon = INPUT_ICON[lane.input];
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex h-full w-full flex-col gap-2.5 border p-3 text-left transition-colors hover:border-electric">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{lane.name}</span>
            {lane.note && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{lane.note}</span>}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{live && <Icon className="size-3" />}{live ? INPUT_LABEL[lane.input].name : ANALYZER_LABEL[lane.analyzer].name}</span>
        </span>
        {live ? (
          <span className={cn("grid h-11 place-items-center border border-dashed text-xs", lane.ready ? "text-muted-foreground" : "border-electric/60 text-electric")}>{lane.ready ? "Live input · open for its status" : "Needs setup · open to finish"}</span>
        ) : lane.files.length ? (
          <span className="flex gap-1.5 overflow-hidden">
            {lane.files.slice(0, 5).map((f) => <Thumb key={f.id} projectId={projectId} f={f} preview={preview} className="size-11 shrink-0" />)}
            {lane.files.length > 5 && <span className="grid size-11 place-items-center border font-mono text-[11px] text-muted-foreground">+{lane.files.length - 5}</span>}
          </span>
        ) : (
          <span className="grid h-11 place-items-center border border-dashed text-xs text-muted-foreground">No files yet · open to add</span>
        )}
        {!live && (
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>{lane.files.length} file{lane.files.length === 1 ? "" : "s"}</span>
            {lane.files.length > 0 && <span>{read} read</span>}
            {working > 0 && <span className="inline-flex items-center gap-1 text-electric"><Loader2 className="size-3 animate-spin" />{working} reading</span>}
          </span>
        )}
        <span className={cn("flex flex-wrap gap-1 border-t pt-2", live && "mt-auto")}>
          {lane.feeds.length ? lane.feeds.map((id) => <span key={id} className="border border-signal/60 px-1.5 py-0.5 text-[11px]">{nameOf(id)}</span>) : <span className="text-[11px] text-destructive">Feeds no product yet</span>}
        </span>
      </button>
    </li>
  );
}

function LaneDetail({ projectId, lane, products, actions, setup, preview, onBack }: { projectId: string; lane: LaneData; products: LaneProduct[]; actions: LaneActions; setup?: React.ReactNode; preview?: boolean; onBack: () => void }) {
  const router = useRouter();
  const [feeds, setFeeds] = useState(lane.feeds);
  const [sure, setSure] = useState(false);
  const [busy, startTransition] = useTransition();
  const can = products.filter((p) => laneFeeds(lane, p.id));
  const live = lane.input !== "files";

  const toggle = (id: string) => {
    const next = feeds.includes(id) ? feeds.filter((x) => x !== id) : [...feeds, id];
    setFeeds(next);
    startTransition(() => actions.setFeeds(lane.id, next));
  };
  const removeFile = async (id: string) => {
    if (preview) return;
    await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="@container grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <button type="button" onClick={onBack} aria-label="Back to all lanes" className="grid size-8 shrink-0 place-items-center border text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></button>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">{lane.name}<span className="border px-1.5 py-0.5 font-mono text-[10px] font-normal uppercase tracking-wider text-muted-foreground">{live ? INPUT_LABEL[lane.input].name : ANALYZER_LABEL[lane.analyzer].name}</span></p>
            {lane.note && <p className="text-sm text-muted-foreground">{lane.note}</p>}
          </div>
        </div>
        {sure ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{live ? "Remove the lane and stop this input?" : `Remove the lane and its ${lane.files.length} files?`}</span>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => startTransition(async () => { await actions.remove(lane.id); onBack(); })}>Remove</Button>
            <Button variant="ghost" size="sm" onClick={() => setSure(false)}>Keep</Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setSure(true)}><Trash2 className="size-3.5" />Remove lane</Button>
        )}
      </div>

      <FeedChips products={can} feeds={feeds} onToggle={toggle} lane={lane} pending={busy} />
      {can.length > 0 && !feeds.length && <p className="text-xs text-muted-foreground">Feeding nothing: {live ? "its rows are still kept" : "files here are still read"}, but no product shows them.</p>}

      {live ? (
        setup ?? <p className="border border-dashed p-4 text-sm text-muted-foreground">{INPUT_LABEL[lane.input].blurb}. Its setup shows here.</p>
      ) : preview ? (
        <div className="flex flex-col items-center gap-1 border border-dashed px-3 py-8 text-sm text-muted-foreground">Drop a file or click to upload<span className="font-mono text-xs">{ANALYZER_LABEL[lane.analyzer].files}</span></div>
      ) : (
        <UploadPanel laneId={lane.id} daily={lane.analyzer === "body"} list={false} uploads={lane.files} />
      )}

      {!live && <section>
        <p className={label}>In this lane · {lane.files.length}</p>
        {lane.files.length ? (
          <ul className="mt-2 grid grid-cols-2 gap-2 @md:grid-cols-3 @2xl:grid-cols-4">
            {lane.files.map((f) => (
              <li key={f.id} className="group border">
                <Thumb projectId={projectId} f={f} preview={preview} className="aspect-[4/3] w-full" />
                <div className="grid gap-0.5 p-2">
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs" title={f.filename}>{f.filename}</span>
                    <button type="button" onClick={() => removeFile(f.id)} aria-label={`Delete ${f.filename}`} className="text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className={cn("size-1.5 rounded-full", READ_DOT[f.read])} aria-hidden />{READ_TEXT[f.read]}</span>
                    {f.rows > 0 && <span>{f.rows} rows</span>}
                    <span>{f.takenOn ?? f.createdAt.slice(0, 10)}</span>
                    <span>{formatSize(f.size)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 border border-dashed p-4 text-sm text-muted-foreground">Nothing here yet. Drop the first file above and it is read straight away.</p>
        )}
      </section>}
    </div>
  );
}
