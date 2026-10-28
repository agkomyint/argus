"use client";

import { ArrowRight, Eye, Lock, Maximize2, Minimize2, Minus, Video } from "lucide-react";
import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { INPUT_ICON } from "@/components/studio/lane-drop";
import { MaskOverlay, placed } from "@/components/studio/mask-overlay";
import { openStudioWindow } from "@/components/studio/studio-window";
import { when, type Fed } from "@/components/studio/studio-timeline";
import { INPUT_LABEL } from "@/lib/setup-rules";
import type { ShareMedia } from "@/lib/share-types";
import type { TlItem, TlLane, TlStep } from "@/lib/studio-timeline-types";
import { cn } from "@/lib/utils";

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/** How the middle of the studio is split: both panels, or one of them filling it with the other down to its bar. */
export type MiddleLayout = "split" | "preview" | "story";
const KEY = "argus.studio.middle";

// The viewer's split, kept in this browser like the timeline mode. Missing storage falls back to the default.
const readMiddle = (): MiddleLayout | null => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "split" || v === "preview" || v === "story" ? v : null;
  } catch {
    return null;
  }
};
const listen = (f: () => void) => {
  window.addEventListener("storage", f);
  window.addEventListener(KEY, f);
  return () => { window.removeEventListener("storage", f); window.removeEventListener(KEY, f); };
};
export function useMiddle(fallback: MiddleLayout = "split") {
  const stored = useSyncExternalStore(listen, readMiddle, () => null);
  const set = (m: MiddleLayout) => {
    try { localStorage.setItem(KEY, m); } catch { /* kept for this visit only */ }
    window.dispatchEvent(new Event(KEY));
  };
  return [stored ?? fallback, set] as const;
}

/** A panel's size and its two buttons. Minimizing one gives the other the room; pressing either again restores the split. */
export type PanelSize = { size: "open" | "min" | "max"; onMin: () => void; onMax: () => void };
function PanelButtons({ name, panel }: { name: string; panel: PanelSize }) {
  const btn = "grid size-5 place-items-center text-muted-foreground hover:bg-accent hover:text-foreground";
  return (
    <span className="flex shrink-0 items-center" onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={panel.onMin} className={cn(btn, panel.size === "min" && "text-electric")} aria-label={panel.size === "min" ? `Restore ${name}` : `Minimize ${name}`} title={panel.size === "min" ? "Restore" : "Minimize"}>
        <Minus className="size-3" />
      </button>
      <button type="button" onClick={panel.onMax} className={cn(btn, panel.size === "max" && "text-electric")} aria-label={panel.size === "max" ? `Restore ${name}` : `Maximize ${name}`} title={panel.size === "max" ? "Restore" : "Maximize"}>
        {panel.size === "max" ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
      </button>
    </span>
  );
}

/**
 * The middle top of the studio: the picture the AI looked at. It is the file picked on the timeline or a lane,
 * or else the newest one up to the playhead. Under it, what the model named, with the picked product's
 * findings first. Muse Spark names things; where SAM 3.1 located them, their outlines are drawn on the picture.
 */
export const ScenePreview = memo(function ScenePreview({ media: nextMedia, item: nextItem, lane: nextLane, hidden, types, product, onOpen, panel, className }: {
  media: ShareMedia | null; item: TlItem | null; lane: TlLane | null;
  /** The owner kept media private in this replay. */
  hidden?: boolean;
  /** The picked product's dataset types, so its findings come first. */
  types?: string[]; product?: string; onOpen: (id: string) => void;
  /** Minimize and maximize, when the studio lets this panel change size. Minimized, only its bar shows. */
  panel?: PanelSize; className?: string;
}) {
  const { media, item, lane } = useHeld(nextMedia, nextItem, nextLane);
  const min = panel?.size === "min";
  const locked = !!lane?.locked;
  const mine = (f: ShareMedia["findings"][number]) => !!types?.includes(f.type);
  // Spark's names are the chips; SAM's outlines are drawn on the picture, and counted once at the end.
  const findings = media ? media.findings.filter((f) => f.type !== "object_mask").sort((a, b) => Number(mine(b)) - Number(mine(a))) : [];
  const masks = media ? placed(media.findings).length : 0;
  return (
    <section aria-label="Preview" className={cn("flex min-h-0 flex-col bg-card", className)}>
      <div className={cn("flex h-8 shrink-0 items-center gap-2 px-2", !min && "border-b")} onDoubleClick={panel?.onMax}>
        <Eye className="size-3 shrink-0 text-muted-foreground" />
        <span className={cn(label, "shrink-0")}>Preview · what the AI looked at</span>
        <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-muted-foreground">{item && `${lane?.name} · ${item.label} · ${when(item.t, false)}`}</span>
        {panel && <PanelButtons name="preview" panel={panel} />}
      </div>
      {!min && <>
      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden bg-black/60">
        {locked ? (
          <Note icon={Lock} title="This lane is private." text="Body check-ins are never shown. What the AI worked out from them still counts below." />
        ) : hidden ? (
          <Note icon={Eye} title="The owner kept media private." text="You still see every step the AI took and what each product got." />
        ) : media ? (
          <button type="button" onClick={() => onOpen(media.id)} className="relative size-full" aria-label={`Open ${media.name}`}>
            {media.kind === "video"
              ? <span className="grid size-full place-items-center text-muted-foreground"><Video className="size-8" /></span>
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link; next/image would cache it
              : <img src={media.src} alt={media.name} className="size-full object-contain" />}
            {media.kind !== "video" && <MaskOverlay findings={media.findings} />}
            <span className="absolute left-2 top-2 flex items-center gap-1.5 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"><span className="size-1.5 rounded-full bg-electric" />{media.kind}</span>
          </button>
        ) : item ? (
          <Note icon={lane ? INPUT_ICON[lane.input] : Eye} title={item.kind === "reading" ? "Live readings have no picture." : "No picture was kept for this one."} text="The steps below show what the AI and the code did with it." />
        ) : (
          <p className="max-w-64 text-center text-[11px] text-muted-foreground">Nothing has come in yet at this point. Press play, or click a dot on the timeline.</p>
        )}
      </div>
      {media && !locked && !hidden && (
        <div className="flex shrink-0 items-center gap-2 border-t px-2 py-1" title={`${masks ? "Muse Spark names what it sees; SAM 3.1 outlines where each one is." : "The model names what it sees. Outlines appear when a product asks SAM 3.1 where things are."}${product && types?.length ? ` ${product} findings come first.` : ""}`}>
          <span className={cn(label, "shrink-0")}>Named</span>
          {findings.length === 0 ? <span className="min-w-0 truncate text-[11px] text-muted-foreground">{media.kind === "video" ? "Videos are read frame by frame; pick a frame." : "Nothing found in this one."}</span> : (
            <ul className="flex min-w-0 flex-1 gap-1 overflow-hidden">
              {grouped(findings).map((f) => (
                <li key={f.label} title={f.detail} className={cn("shrink-0 whitespace-nowrap border px-1 text-[10px] leading-4", types?.length && !mine(f) ? "bg-background text-muted-foreground" : "border-electric/40 bg-electric/10")}>
                  {f.label}{f.n > 1 && <span className="ml-0.5 font-mono text-muted-foreground">×{f.n}</span>}{f.confidence !== null && <span className="ml-1 font-mono text-muted-foreground">{Math.round(f.confidence * 100)}%</span>}
                </li>
              ))}
            </ul>
          )}
          {masks > 0 && <span className="shrink-0 border border-electric/40 px-1 font-mono text-[10px] leading-4 text-electric">SAM · {masks} outlined</span>}
        </div>
      )}
      </>}
    </section>
  );
});

type Shown = { media: ShareMedia | null; item: TlItem | null; lane: TlLane | null };

/**
 * What the preview shows: the current file, but only once its picture has loaded and decoded. Until then the
 * last one stays, with its own label and findings, so playing goes from one whole picture to the next and the
 * words never run ahead of the picture. Anything without a picture shows at once.
 */
function useHeld(media: ShareMedia | null, item: TlItem | null, lane: TlLane | null): Shown {
  const [held, setHeld] = useState<Shown>({ media, item, lane });
  const src = media && media.kind !== "video" ? media.src : null;
  const ready = !src || src === held.media?.src;
  if (ready && (held.media !== media || held.item !== item || held.lane !== lane)) setHeld({ media, item, lane });
  useEffect(() => {
    if (ready || !src) return;
    let live = true;
    const next = new Image();
    next.src = src;
    // A picture that fails to load is shown anyway, so the browser's own broken-image state is what you see.
    next.decode().catch(() => undefined).then(() => { if (live) setHeld({ media, item, lane }); });
    return () => { live = false; };
  }, [ready, src, media, item, lane]);
  return held;
}

type Found = ShareMedia["findings"][number];

/** The same name found more than once becomes one chip with a count and its best confidence, in first-seen order. */
function grouped(findings: Found[]): (Found & { n: number })[] {
  const out = new Map<string, Found & { n: number }>();
  for (const f of findings) {
    const g = out.get(f.label);
    if (!g) { out.set(f.label, { ...f, n: 1 }); continue; }
    g.n++;
    if (f.confidence !== null && (g.confidence === null || f.confidence > g.confidence)) g.confidence = f.confidence;
  }
  return [...out.values()];
}

function Note({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="max-w-64 p-4 text-center">
      <Icon className="mx-auto size-4 text-muted-foreground" />
      <p className="mt-2 text-xs">{title}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{text}</p>
    </div>
  );
}

const STEP: Record<TlStep["kind"], { mark: string; verb: string; tone: string }> = {
  model: { mark: "◆", verb: "Model looked", tone: "text-electric" },
  code: { mark: "■", verb: "Code checked", tone: "text-signal" },
  tool: { mark: "●", verb: "Tool ran", tone: "text-chart-4" },
};

/** A step's name without its area, in words: `perception.image` → "image". */
const short = (name: string) => name.split(".").slice(1).join(" ").replaceAll("_", " ") || name;
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);

export type Recent = { step: TlStep; item: TlItem | null; lane: TlLane | null };

/**
 * The middle bottom: how the AI read the picked file, step by step, from the lane it came in through to
 * the products it changed. With nothing picked, the latest recorded steps up to the playhead.
 */
export const LaneStory = memo(function LaneStory({ item, lane, fed, names, recent, tq, onProduct, onSelect, owner, panel, className }: {
  item: TlItem | null; lane: TlLane | null; fed: Fed; names: Record<string, string>; recent: Recent[]; tq: number;
  onProduct: (id: string) => void; onSelect: (item: TlItem, lane: TlLane) => void; owner?: boolean;
  /** Minimize and maximize, as on the preview. */
  panel?: PanelSize; className?: string;
}) {
  const min = panel?.size === "min";
  return (
    <section aria-label="How the AI read it" className={cn("flex min-h-0 flex-col bg-card", className)}>
      <div className={cn("flex h-8 shrink-0 items-center gap-2 px-2", !min && "border-b")} onDoubleClick={panel?.onMax}>
        <span className={cn(label, "shrink-0")}>{item ? "How the AI read it" : "At the playhead"}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-muted-foreground">{min ? `${(item ? item.steps.length : recent.length).toLocaleString("en-US")} steps` : "models propose · code computes"}</span>
        {owner && <button type="button" onClick={() => openStudioWindow("observatory")} onDoubleClick={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1 text-[11px] text-electric hover:text-foreground">Open in Observatory<ArrowRight className="size-3" /></button>}
        {panel && <PanelButtons name="steps" panel={panel} />}
      </div>
      {!min && <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {item && lane ? <Story item={item} lane={lane} fed={fed} names={names} tq={tq} onProduct={onProduct} /> : recent.length === 0 ? (
          <p className="p-3 text-[11px] text-muted-foreground">No steps recorded yet at this point. Each model call and code check shows up here as it happens.</p>
        ) : (
          <ul className="font-mono text-[10px] leading-relaxed">
            {recent.map(({ step, item: it, lane: ln }) => (
              <li key={step.id}>
                <button type="button" disabled={!it || !ln} onClick={() => it && ln && onSelect(it, ln)} className={cn("flex w-full gap-2 px-2 py-0.5 text-left even:bg-background/40 enabled:hover:bg-accent/40", !step.ok && "text-destructive")}>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{when(step.t, false)}</span>
                  <span className={cn("shrink-0", STEP[step.kind].tone)}>{STEP[step.kind].mark}</span>
                  <span className="min-w-0 flex-1 truncate">{step.name}{step.model ? ` · ${step.model}` : ""}{step.wrote ? ` · kept ${step.wrote}` : ""}{step.ok ? "" : " · failed"}</span>
                  <span className="shrink-0 truncate text-muted-foreground">{ln?.name ?? "project"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </section>
  );
});

function Story({ item, lane, fed, names, tq, onProduct }: { item: TlItem; lane: TlLane; fed: Fed; names: Record<string, string>; tq: number; onProduct: (id: string) => void }) {
  const Icon = INPUT_ICON[lane.input];
  const steps = [...item.steps].sort((a, b) => a.t - b.t);
  const later = item.t > tq;
  let n = 1;
  return (
    <ol className="space-y-px p-2 text-xs">
      <Row n={n++} mark={<Icon className="size-3" />} title={`Came in through ${lane.name}`} sub={`${INPUT_LABEL[lane.input].name} · ${item.label} · ${when(item.t)} UTC`} />
      {steps.length === 0 ? (
        <Row n={n++} mark="·" title={item.state === "waiting" ? "Waiting to be read" : item.state === "reading" ? "Being read now" : "No step was recorded for it"}
          sub={item.kind === "reading" ? "Live readings are kept as they come. No model reads them." : "Older work ran before every step was recorded."} />
      ) : steps.map((s) => (
        <Row key={s.id} n={n++} mark={STEP[s.kind].mark} tone={s.ok ? STEP[s.kind].tone : "text-destructive"}
          title={`${s.ok ? STEP[s.kind].verb : `${STEP[s.kind].verb}, failed`} · ${short(s.name)}`}
          sub={[s.model, s.tokens !== null ? `${s.tokens.toLocaleString("en-US")} tokens` : null, ms(s.ms), s.wrote ? `kept ${s.wrote}` : null].filter(Boolean).join(" · ")}
          error={s.error} />
      ))}
      <li className="flex gap-2 border bg-background/40 p-2">
        <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">{n}</span>
        <span className="w-4 shrink-0 text-center">→</span>
        <div className="min-w-0 flex-1">
          <p>{fed.length ? "Products it changed" : item.rows.length ? `It became ${item.rows.length} ${item.rows.length === 1 ? "row" : "rows"}, not in a product yet` : "Nothing came out of it"}</p>
          {fed.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {fed.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => onProduct(f.id)} className="flex items-center gap-1.5 border px-1.5 py-0.5 text-[11px] hover:border-electric">
                    <span className="tl-tri" style={{ color: f.color }} aria-hidden />{names[f.id] ?? f.id}<span className="font-mono text-[10px] text-signal">+{f.n}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </li>
      {later && <li className="p-1 text-[10px] text-muted-foreground">This is after the playhead. Press play to watch it happen.</li>}
    </ol>
  );
}

function Row({ n, mark, tone, title, sub, error }: { n: number; mark: React.ReactNode; tone?: string; title: string; sub?: string; error?: string }) {
  return (
    <li className="flex gap-2 border bg-background/40 p-2">
      <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">{n}</span>
      <span className={cn("grid w-4 shrink-0 place-items-center self-start pt-0.5 text-[11px] leading-none", tone ?? "text-muted-foreground")}>{mark}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate">{title}</p>
        {sub && <p className="truncate font-mono text-[10px] text-muted-foreground">{sub}</p>}
        {error && <p className="mt-0.5 line-clamp-2 font-mono text-[10px] text-destructive">{error}</p>}
      </div>
    </li>
  );
}
