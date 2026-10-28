"use client";

import { useEffect, useRef, useState } from "react";
import { WidgetView } from "@/widgets/use";

const examples = [
  { id: "stat-trend", title: "People count", description: "A count and how it changes over time." },
  { id: "heat-grid", title: "Density heatmap", description: "Where activity is concentrated." },
  { id: "category-bars", title: "Object categories", description: "A breakdown of detected objects." },
  { id: "stacked-share", title: "Category share", description: "How a whole splits into parts." },
  { id: "volume-bars", title: "Activity over time", description: "How much data arrived over time." },
  { id: "event-feed", title: "Event feed", description: "A timeline of detected events." },
];

export function LandingExamples() {
  const [expanded, setExpanded] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const container = windowRef.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cards = [...container.querySelectorAll<HTMLElement>(".landing-example-card")];
    // Card positions are measured once (and again on resize), not every frame, so the loop never forces a layout.
    let centers: number[] = [];
    let half = 0;
    let width = 1;
    const measure = () => {
      centers = cards.map((card) => card.offsetLeft + card.offsetWidth / 2);
      half = container.scrollWidth / 2;
      width = Math.max(container.clientWidth, 1);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(container);
    let frame = 0;
    let last = 0;
    let scroll = container.scrollLeft;
    const animate = (time: number) => {
      scroll = container.scrollLeft;
      if (!paused && !motion.matches && last) scroll += Math.min(time - last, 40) * 0.025;
      if (half && scroll >= half) scroll -= half;
      container.scrollLeft = scroll;
      const center = scroll + width / 2;
      cards.forEach((card, i) => {
        const distance = Math.max(-1.4, Math.min(1.4, (centers[i] - center) / (width / 2)));
        card.style.translate = `0 ${Math.min(70, distance * distance * 42)}px`;
        card.style.rotate = `${distance * 5}deg`;
      });
      last = time;
      frame = requestAnimationFrame(animate);
    };
    // Only animate while the carousel is on screen.
    const seen = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      last = 0;
      if (entry.isIntersecting) frame = requestAnimationFrame(animate);
    });
    seen.observe(container);
    return () => { cancelAnimationFrame(frame); seen.disconnect(); resize.disconnect(); };
  }, [paused]);
  const drag = useRef<{ x: number; scroll: number } | null>(null);
  return (
    <section className="overflow-hidden pb-16 sm:pb-24">
      <div className="mx-auto mb-6 flex max-w-6xl flex-wrap items-end justify-between gap-3 px-4 sm:px-6">
        <div><h2 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">The factory of data products.</h2></div>
        <p className="font-mono text-xs text-muted-foreground">← Drag or swipe to explore →</p>
      </div>
      <div ref={windowRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} className="landing-examples-window relative cursor-grab overflow-x-auto active:cursor-grabbing" tabIndex={0} aria-label="Example data products; drag or scroll horizontally to see more"
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) event.currentTarget.scrollLeft = drag.current.scroll - (event.clientX - drag.current.x);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}>
        <div className="flex w-max gap-4 px-4 pb-28 pt-8 sm:px-6">
          {[0, 1].map((copy) => <div key={copy} className="flex gap-4" aria-hidden={copy === 1 || undefined}>
            {examples.map((example) => (
              <article key={example.id} className="landing-example-card w-72 shrink-0 rounded-2xl border bg-card p-5 sm:w-80">
                <div className="mb-4 flex items-center justify-between"><span className="font-mono text-xs uppercase tracking-widest text-electric">Data product</span><span className="rounded-full border px-2 py-1 font-mono text-xs text-muted-foreground">Sample</span></div>
                <h3 className="text-lg font-medium tracking-tight">{example.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{example.description}</p>
                <div className="mt-5 h-40 overflow-hidden rounded-lg border bg-background"><WidgetView use={{ id: example.id }} data={[]} size="compact" showSample /></div>
              </article>
            ))}
          </div>)}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <div className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">A data product</strong> turns observations into something useful: a count, chart, map, or feed.
          {expanded && <> It brings the data and its visual together, so you can explore <strong className="font-medium text-foreground">what happened and how the result was made.</strong> For example, it could turn your activity records into a visual trend, helping you spot patterns in how you spend your time.</>}{" "}
          <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="text-sm font-medium text-electric underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{expanded ? "Show less" : "Read more"}</button>
        </div>
      </div>
    </section>
  );
}















