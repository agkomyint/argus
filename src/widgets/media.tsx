"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * Where a widget can fetch the picture a row came from. A replay passes the media it was allowed to share;
 * the owner's pages pass the project's media route. Without a provider widgets draw without pictures.
 */
type Lookup = (id: string) => string | null;

const MediaContext = createContext<Lookup>(() => null);

export function MediaProvider({ media, base, children }: { media?: { id: string; src: string }[] | null; base?: string; children: ReactNode }) {
  const lookup = useMemo<Lookup>(() => {
    const byId = new Map((media ?? []).map((m) => [m.id, m.src]));
    // Sample rows (the widget previews) point at made-up "sample-" ids that no route can serve.
    return (id) => byId.get(id) ?? (base && !id.startsWith("sample-") ? `${base}${id}` : null);
  }, [media, base]);
  return <MediaContext.Provider value={lookup}>{children}</MediaContext.Provider>;
}

/** The picture for this media id (an upload id or a kept frame), or null when it isn't shared. */
export const useMediaSrc = (id: unknown) => {
  const lookup = useContext(MediaContext);
  return typeof id === "string" && id ? lookup(id) : null;
};
