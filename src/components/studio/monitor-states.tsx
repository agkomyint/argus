"use client";

import { useMemo, useState } from "react";
import { MonitorWall } from "@/components/studio/monitor-wall";
import { ScenePreview } from "@/components/studio/lane-story";
import { latestLane, monitorsAt } from "@/lib/monitors";
import type { ShareMedia } from "@/lib/share-types";
import type { TlItem, TlLane } from "@/lib/studio-timeline-types";

/** Variants of the real monitor wall for /design PRV-01: one lane, a few, and many, with the playhead you can move. */

const KINDS: Pick<TlLane, "input" | "analyzer">[] = [
  { input: "files", analyzer: "objects" }, { input: "files", analyzer: "speech" }, { input: "weather", analyzer: "objects" }, { input: "camera", analyzer: "objects" },
];
const HUES = [210, 20, 150, 280, 45, 340, 180, 100];
const art = (name: string, hue: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='320' height='180' fill='hsl(${hue} 40% 22%)'/><circle cx='230' cy='60' r='34' fill='hsl(${hue} 60% 55%)'/><text x='14' y='164' font-family='monospace' font-size='14' fill='white'>${name}</text></svg>`)}`;

function makeLanes(n: number): { lanes: TlLane[]; media: Map<string, ShareMedia> } {
  const media = new Map<string, ShareMedia>();
  const lanes = Array.from({ length: n }, (_, i): TlLane => {
    const kind = KINDS[i % KINDS.length];
    const name = i < 4 ? ["Launch video", "Mission audio", "Pad weather", "Webcam"][i] : `Lane ${i + 1}`;
    // Lanes start at different moments, and some stay empty for a while: the case that left the old preview stuck on one lane.
    const items = Array.from({ length: 4 }, (_, k): TlItem => {
      const id = `l${i}-${k}`;
      const t = (i * 7 + k * 25) % 100;
      if (kind.analyzer === "objects" && kind.input !== "weather") media.set(id, { id, kind: "frame", t, name: `${name} ${k + 1}`, src: art(`${name} #${k + 1}`, HUES[i % HUES.length]), source: name, findings: [] });
      return { id, kind: kind.input === "weather" ? "reading" : "frame", t, done: t, state: "done", label: `${name} #${k + 1}`, steps: [], rows: [] };
    });
    return { id: `l${i}`, name, ...kind, feeds: [], items: items.sort((a, b) => a.t - b.t), ...(i === 5 ? { locked: true } : {}) };
  });
  return { lanes, media };
}

function Demo({ lanesN, startAt = 60 }: { lanesN: number; startAt?: number }) {
  const { lanes, media } = useMemo(() => makeLanes(lanesN), [lanesN]);
  const [tq, setTq] = useState(startAt);
  const [focus, setFocus] = useState<string | null>(null);
  const mediaOf = (i: TlItem) => media.get(i.id) ?? null;
  const monitors = monitorsAt(lanes, tq, mediaOf);
  const auto = focus === null;
  const shown = monitors.find((m) => m.lane.id === (focus ?? latestLane(monitors))) ?? null;
  return (
    <div className="@container flex h-[26rem] max-w-3xl flex-col border">
      <ScenePreview media={shown?.media ?? null} item={shown?.item ?? null} lane={shown?.lane ?? null} onOpen={() => undefined} className="min-h-0 flex-1" />
      <MonitorWall monitors={monitors} focus={shown?.lane.id ?? null} auto={auto} onFocus={setFocus} onAuto={() => setFocus(null)} />
      <label className="flex items-center gap-2 border-t px-2 py-1 font-mono text-[10px] text-muted-foreground">playhead
        <input type="range" min={0} max={100} value={tq} onChange={(e) => setTq(Number(e.target.value))} className="flex-1" aria-label="Playhead" />{tq}</label>
    </div>
  );
}

const title = "mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

export function MonitorStates() {
  return (
    <div className="grid gap-6">
      <div><p className={title}>One lane: no wall, the Preview is all there is</p><Demo lanesN={1} /></div>
      <div><p className={title}>Four lanes: a strip, each lane shows its own newest item. Move the playhead to 0: lanes with nothing yet say so</p><Demo lanesN={4} startAt={30} /></div>
      <div><p className={title}>Twenty-four lanes: pages, a filter (try &quot;audio&quot;), arrow keys, and a Wall button for every lane at once</p><Demo lanesN={24} /></div>
    </div>
  );
}
