"use client";

import { useState } from "react";
import { Empty } from "@/components/widgets/empty";
import { useMediaSrc } from "@/widgets/media";
import { personaColor, personaLabel, pointsOf, screenKey, screenName, severityOf, SEVERITY_TONE, stat } from "@/widgets/library/persona-kit";
import type { FlatRow, WidgetProps } from "@/widgets/schema";

type Screen = { key: string; name: string; uploadId: unknown; t: number; views: FlatRow[]; friction: FlatRow[] };

function screensOf(rows: FlatRow[]): Screen[] {
  const by = new Map<string, Screen>();
  for (const r of rows) {
    if (r.type !== "persona_view" && r.type !== "persona_friction" && !r.attention && !r.issue) continue;
    const k = screenKey(r);
    const s = by.get(k) ?? { key: k, name: screenName(r), uploadId: r.upload_id, t: r.t, views: [], friction: [] };
    if (Array.isArray(r.attention)) s.views.push(r);
    else s.friction.push(r);
    by.set(k, s);
  }
  return [...by.values()].filter((s) => s.views.length).sort((a, b) => a.t - b.t);
}

/**
 * The screenshot as each simulated visitor saw it: soft heat where their eyes went, numbered first looks,
 * and pins where they got stuck. Toggle personas to compare them; click a pin to read what went wrong.
 */
export function PerceptionMap({ rows, size }: WidgetProps) {
  const screens = screensOf(rows);
  const [pick, setPick] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pin, setPin] = useState<number | null>(null);
  if (!screens.length) return <Empty text="No screens reviewed yet." />;

  // Follow the newest screen until the viewer picks one.
  const screen = screens.find((s) => s.key === pick) ?? screens[screens.length - 1];
  const views = screen.views.filter((v) => !hidden.has(String(v.persona)));
  const friction = screen.friction.filter((f) => !hidden.has(String(f.persona)));

  if (size === "compact") return <Shot screen={screen} views={screen.views} friction={[]} pin={null} onPin={() => {}} markers={false} />;

  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const open = pin !== null ? friction[pin] : null;

  return (
    <div className="@container h-full overflow-auto [scrollbar-gutter:stable]">
      <div className="grid gap-3">
        {screens.length > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {screens.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => { setPick(s.key); setPin(null); }}
                className={`shrink-0 border px-2.5 py-1 text-left text-[11px] transition-colors ${s.key === screen.key ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span className="font-mono text-[9px] opacity-60">{String(i + 1).padStart(2, "0")}</span> {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 @3xl:grid-cols-[minmax(0,3fr)_minmax(15rem,2fr)]">
          <section className="grid gap-2">
            <div className="flex flex-wrap gap-1">
              {screen.views.map((v) => {
                const id = String(v.persona);
                const off = hidden.has(id);
                return (
                  <button key={id} type="button" onClick={() => { toggle(id); setPin(null); }} className={`flex items-center gap-1.5 border px-2 py-0.5 text-[11px] transition-opacity ${off ? "opacity-40" : ""}`} aria-pressed={!off}>
                    <span className="size-2 rounded-full" style={{ background: personaColor(id) }} />
                    {personaLabel(v)}
                  </button>
                );
              })}
            </div>
            <div className="h-[min(56vh,30rem)] border bg-muted/30">
              <Shot screen={screen} views={views} friction={friction} pin={pin} onPin={(i) => setPin(pin === i ? null : i)} markers />
            </div>
            {open ? (
              <div className="flex items-start gap-2 border px-3 py-2 text-xs">
                <span className="mt-1 size-2 shrink-0 rotate-45" style={{ background: SEVERITY_TONE[severityOf(open)] }} />
                <div className="min-w-0">
                  <p className="font-medium">{String(open.label ?? "Friction")} <span className="font-mono text-[10px] uppercase text-muted-foreground">{severityOf(open)} · {personaLabel(open)}</span></p>
                  <p className="text-muted-foreground">{String(open.issue ?? "")}</p>
                </div>
              </div>
            ) : (
              friction.length > 0 && <p className="text-[11px] text-muted-foreground">Tap a ◆ pin to read what got in the way.</p>
            )}
          </section>

          <section className="grid content-start gap-2">
            <p className={stat}>What each visitor thought</p>
            {screen.views.map((v) => {
              const id = String(v.persona);
              const clarity = Number(v.clarity);
              return (
                <article key={id} className={`border p-2.5 transition-opacity ${hidden.has(id) ? "opacity-40" : ""}`}>
                  <header className="flex items-center gap-2 text-xs">
                    <span className="size-2 rounded-full" style={{ background: personaColor(id) }} />
                    <span className="font-medium">{personaLabel(v)}</span>
                    <span className={`ml-auto font-mono text-[10px] uppercase ${v.continue ? "text-signal" : "text-destructive"}`}>{v.continue ? "Would continue" : "Would leave"}</span>
                  </header>
                  {typeof v.quote === "string" && <p className="mt-1.5 text-[13px] leading-snug">“{v.quote}”</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <span className={stat}>Clarity</span>
                    <span className="h-1 flex-1 bg-muted"><span className="block h-full transition-[width] duration-500" style={{ width: `${(clarity / 10) * 100}%`, background: personaColor(id) }} /></span>
                    <span className="font-mono text-[11px] tabular-nums">{Number.isFinite(clarity) ? clarity : "–"}/10</span>
                  </div>
                  {typeof v.purpose === "string" && <p className="mt-1.5 text-[11px] text-muted-foreground">Thinks it is for: {v.purpose}</p>}
                </article>
              );
            })}
            <p className="text-[10px] text-muted-foreground">Simulated visitors. A model&apos;s opinion, not user research.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** The screenshot (or a plain frame when it isn't shared) with every overlay in the same 0..1 space. */
function Shot({ screen, views, friction, pin, onPin, markers }: { screen: Screen; views: FlatRow[]; friction: FlatRow[]; pin: number | null; onPin: (i: number) => void; markers: boolean }) {
  const src = useMediaSrc(screen.uploadId);
  const [ratio, setRatio] = useState(16 / 10);
  return (
    <div className="grid size-full place-items-center overflow-hidden" style={{ containerType: "size" }}>
      <div className="relative overflow-hidden" style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, aspectRatio: ratio }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- private media route, not a static asset
          <img src={src} alt={screen.name} className="absolute inset-0 size-full object-fill" onLoad={(e) => e.currentTarget.naturalWidth && setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[size:12.5%_12.5%]">
            <span className="bg-background/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{screen.name}</span>
          </div>
        )}
        {views.flatMap((v) =>
          pointsOf(v.attention).map((p, i) => {
            const r = 9 + (p.weight ?? 0.6) * 12;
            return (
              <span
                key={`h-${String(v.persona)}-${i}`}
                className="pointer-events-none absolute -translate-1/2 rounded-full mix-blend-multiply transition-opacity duration-500 starting:opacity-0 dark:mix-blend-screen"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${r}%`, aspectRatio: 1, background: `radial-gradient(circle, color-mix(in oklch, ${personaColor(v.persona)} 55%, transparent) 0%, transparent 70%)` }}
              />
            );
          }),
        )}
        {markers &&
          views.flatMap((v) =>
            pointsOf(v.attention).slice(0, 3).map((p, i) => (
              <span
                key={`m-${String(v.persona)}-${i}`}
                title={`${personaLabel(v)} · look ${i + 1}: ${p.label ?? ""}`}
                className="absolute grid size-4 -translate-1/2 place-items-center rounded-full font-mono text-[9px] font-semibold text-white shadow ring-1 ring-white/70"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: personaColor(v.persona) }}
              >
                {i + 1}
              </span>
            )),
          )}
        {markers &&
          friction.map((f, i) => (
            <button
              key={`f-${i}`}
              type="button"
              onClick={() => onPin(i)}
              aria-label={`Friction: ${String(f.label ?? "")}`}
              className={`absolute size-3.5 -translate-1/2 rotate-45 shadow ring-2 transition-transform ${pin === i ? "scale-125 ring-foreground" : "ring-white/80 hover:scale-110"}`}
              style={{ left: `${Number(f.x) * 100}%`, top: `${Number(f.y) * 100}%`, background: SEVERITY_TONE[severityOf(f)] }}
            />
          ))}
      </div>
    </div>
  );
}
