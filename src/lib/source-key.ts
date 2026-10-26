/**
 * Every job is tagged with the source it came from, so a source can be paused, resumed and shown
 * with its own progress. DB-free.
 *   src:<id>  a connected source row (weather, sensor, webhook, screen)
 *   tl:<id>   a files timeline
 *   files     uploads that sit outside any timeline
 *   screen    screen-share frames (one live capture per project)
 */
export type SourceKey = `src:${string}` | `tl:${string}` | "files" | "screen";

export const srcKey = (id: string): SourceKey => `src:${id}`;
export const tlKey = (id: string): SourceKey => `tl:${id}`;

export function parseKey(key: string): { type: "src" | "tl"; id: string } | { type: "files" | "screen" } | null {
  if (key === "files" || key === "screen") return { type: key };
  const m = /^(src|tl):([0-9a-f-]{36})$/i.exec(key);
  return m ? { type: m[1] as "src" | "tl", id: m[2] } : null;
}
