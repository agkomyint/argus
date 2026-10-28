"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShareProjectDialog } from "@/components/workspace/share-project-dialog";
import { STUDIO_WINDOWS, StudioWindow, onStudioWindow, type StudioWindowId, type StudioWindows } from "./studio-window";

/**
 * The owner's half of the studio top bar: the setup windows (Lanes, Products, Observatory, Agents), Share and
 * Ask ARGUS. Windows open over the studio, like OBS settings, so setup never leaves this screen.
 */
export function OwnerBar({ project, windows, ask, open: initial = null }: {
  project: { id: string; name: string; slug: string | null; media: boolean };
  windows: StudioWindows;
  ask?: React.ReactNode;
  /** A window to open on arrival, e.g. Lanes on a project with no lane yet. */
  open?: StudioWindowId | null;
}) {
  const [win, setWin] = useState<StudioWindowId | null>(initial);
  const ids = (Object.keys(windows) as StudioWindowId[]).filter((k) => windows[k]);
  useEffect(() => onStudioWindow((id) => windows[id] && setWin(id)), [windows]);
  return (
    <>
      <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-xs text-muted-foreground" aria-label="Studio menu">
        {ids.map((id) => (
          <button key={id} type="button" onClick={() => setWin(id)} className="shrink-0 hover:text-foreground">
            {STUDIO_WINDOWS[id].title}
          </button>
        ))}
        <Link href="/projects" className="shrink-0 hover:text-foreground">Projects</Link>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ShareProjectDialog id={project.id} name={project.name} slug={project.slug} media={project.media} />
        {ask}
      </div>
      {ids.map((id) => (
        <StudioWindow key={id} id={id} open={win === id} onOpenChange={(o) => setWin(o ? id : null)}>{windows[id]}</StudioWindow>
      ))}
    </>
  );
}
