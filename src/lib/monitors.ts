import type { TlItem, TlLane } from "@/lib/studio-timeline-types";

/**
 * Monitors: what each lane is showing at the playhead. The preview used to show one thing for the whole studio
 * (the newest file of any lane), so with several lanes the one that landed last owned it. Now every lane has its
 * own monitor, one is in focus, and any number of lanes stay reachable by paging, filtering and arrow keys.
 */

export type Monitor<M> = {
  lane: TlLane;
  /** The newest item of this lane up to the playhead, or null when nothing has come in yet. */
  item: TlItem | null;
  /** The picture or file behind it, when there is one. */
  media: M | null;
  /** How many items the lane has received so far, so a quiet lane reads as quiet and not broken. */
  seen: number;
  state: "live" | "empty" | "locked";
};

/** A lane's monitor at the playhead. A picture-bearing item wins over a newer one with none, as the preview always did. */
export function monitorOf<M>(lane: TlLane, tq: number, mediaOf: (item: TlItem) => M | null): Monitor<M> {
  if (lane.locked) return { lane, item: null, media: null, seen: lane.items.filter((i) => i.t <= tq).length, state: "locked" };
  let item: TlItem | null = null;
  let withMedia: TlItem | null = null;
  let seen = 0;
  for (const i of lane.items) {
    if (i.t > tq) continue;
    seen++;
    if (!item || i.t >= item.t) item = i;
    if (mediaOf(i) && (!withMedia || i.t >= withMedia.t)) withMedia = i;
  }
  const shown = withMedia ?? item;
  return { lane, item: shown, media: shown ? mediaOf(shown) : null, seen, state: shown ? "live" : "empty" };
}

export const monitorsAt = <M>(lanes: readonly TlLane[], tq: number, mediaOf: (item: TlItem) => M | null) => lanes.map((l) => monitorOf(l, tq, mediaOf));

/** The lane that changed most recently, which the focus follows while nothing is picked. Null when no lane has anything yet. */
export function latestLane<M>(monitors: readonly Monitor<M>[]): string | null {
  let best: Monitor<M> | null = null;
  for (const m of monitors) if (m.item && (!best || m.item.t > best.item!.t)) best = m;
  return best ? best.lane.id : null;
}

/** Lanes whose name or kind matches every word typed. An empty filter keeps all, in their own order. */
export function filterMonitors<M>(monitors: readonly Monitor<M>[], q: string): Monitor<M>[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...monitors];
  return monitors.filter((m) => { const hay = `${m.lane.name} ${m.lane.input} ${m.lane.analyzer}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}

export const pageCount = (n: number, size: number) => Math.max(1, Math.ceil(n / Math.max(1, size)));

/** One page of tiles; a page past the end settles on the last one, so a filter that shrinks the list never shows nothing. */
export function pageOf<T>(items: readonly T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = pageCount(items.length, size);
  const p = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  return { items: items.slice(p * size, p * size + size), page: p, pages };
}

/** The lane next to this one in the list, stopping at the ends. Used by the arrow keys and the previous/next buttons. */
export function neighbour(ids: readonly string[], current: string | null, step: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return step === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, i + step))];
}

/** The page a lane sits on, so focusing a lane from the timeline brings its tile into view. */
export const pageHolding = (ids: readonly string[], id: string | null, size: number) => { const i = id ? ids.indexOf(id) : -1; return i < 0 ? 0 : Math.floor(i / Math.max(1, size)); };
