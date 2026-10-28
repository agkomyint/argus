"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import type { SharedProject } from "@/lib/explore";

const PREVIEW_MS = 4000;

const span = (ms = 0) => {
  const m = Math.round(ms / 60_000);
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
};

// A fixed date, not "3 days ago": the same on the server and in the browser, and safe to prerender.
const shareDate = (d: Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * A shared project as a replay you want to press play on: a poster (its shared pictures, or the shape of its
 * timeline), a play button and a progress bar. Hovering plays a short preview through the pictures and timeline.
 */
export function ReplayCard({ p, priority }: { p: SharedProject; priority?: boolean }) {
  const posters = p.posters ?? [];
  const bars = p.activity?.length ? p.activity : [];
  const [t, setT] = useState(0);
  const [on, setOn] = useState(false);
  // Only the first picture loads up front. The rest are fetched the first time someone hovers the card.
  const [woke, setWoke] = useState(false);
  const play = () => { setOn(true); setWoke(true); };
  const raf = useRef(0);

  useEffect(() => {
    if (!on || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const tick = (now: number) => {
      setT(((now - start) % PREVIEW_MS) / PREVIEW_MS);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [on]);

  const shown = on && posters.length ? Math.min(posters.length - 1, Math.floor(t * posters.length)) : 0;
  const stop = () => { setOn(false); setT(0); };

  return (
    <Link
      href={`/explore/${p.slug}`}
      onMouseEnter={play}
      onMouseLeave={stop}
      onFocus={play}
      onBlur={stop}
      className="group flex cursor-pointer flex-col gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      aria-label={`Watch the replay of ${p.name}`}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl border bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_oklch,var(--electric)_22%,transparent),transparent_70%)] bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-300 group-hover:-translate-y-0.5 group-hover:border-electric/60 group-hover:shadow-[0_12px_40px_-12px_color-mix(in_oklch,var(--electric)_55%,transparent)]">
        {posters.length > 0 ? (
          (woke ? posters : posters.slice(0, 1)).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed media link; next/image would cache it
            <img
              key={src}
              src={`${src}?w=480`}
              srcSet={`${src}?w=480 480w, ${src}?w=960 960w`}
              sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
              decoding="async"
              alt=""
              loading={priority && i === 0 ? "eager" : "lazy"}
              className={`absolute inset-0 size-full object-cover object-top transition-[opacity,transform] duration-500 group-hover:scale-[1.03] ${i === shown ? "opacity-100" : "opacity-0"}`}
            />
          ))
        ) : (
          <Waveform bars={bars} t={on ? t : 0} />
        )}
        {posters.length > 0 && <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />}

        <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-md bg-black/65 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white backdrop-blur-sm">
          <span className={`size-1.5 rounded-full bg-electric ${on ? "animate-pulse" : ""}`} /> Replay
        </span>
        <span className="absolute bottom-3 right-2.5 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white">
          {p.rows ? `${p.rows.toLocaleString("en-US")} rows${p.spanMs ? ` · ${span(p.spanMs)}` : ""}` : "New"}
        </span>
        {p.products.length > 0 && (
          <span className="absolute bottom-3 left-2.5 right-28 flex gap-1 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="truncate rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] text-white backdrop-blur-sm">{p.products[0]}</span>
            {p.products.length > 1 && <span className="shrink-0 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] text-white backdrop-blur-sm">+{p.products.length - 1}</span>}
          </span>
        )}

        <span className="absolute left-1/2 top-1/2 grid size-14 -translate-1/2 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-sm transition-[transform,background-color,opacity] duration-300 group-hover:scale-110 group-hover:bg-electric group-hover:opacity-100 sm:opacity-90">
          <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" />
        </span>

        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
          <span className="block h-full bg-electric" style={{ width: `${(on ? t : 0) * 100}%` }} />
        </span>
      </div>

      <div className="flex gap-3 px-0.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-electric/15 font-medium text-electric" aria-hidden="true">{p.owner.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="line-clamp-2 font-medium leading-snug transition-colors group-hover:text-electric">{p.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {p.owner} · {p.products.length} {p.products.length === 1 ? "product" : "products"} · {shareDate(p.sharedAt)}
          </p>
        </div>
      </div>
    </Link>
  );
}

/** Without shared pictures the poster is the replay itself: when rows arrived, lit up to the playhead. */
function Waveform({ bars, t }: { bars: number[]; t: number }) {
  const list = bars.length ? bars : Array.from({ length: 24 }, (_, i) => 0.15 + 0.1 * Math.sin(i / 2));
  return (
    <span className="absolute inset-x-5 bottom-7 top-10 flex items-end gap-[3px]" aria-hidden="true">
      {list.map((v, i) => {
        const lit = t > 0 && i / list.length <= t;
        return (
          <span
            key={i}
            className={`min-w-0 flex-1 rounded-sm transition-colors duration-150 ${lit ? "bg-electric" : "bg-electric/30 group-hover:bg-electric/40"}`}
            style={{ height: `${Math.max(6, Math.round(v * 100))}%` }}
          />
        );
      })}
    </span>
  );
}
