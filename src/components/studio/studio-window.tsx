"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Setup in the studio happens in windows over it, like OBS's settings windows, never on another page.
 * Add a window here, then pass its content to <Studio windows={...}>.
 */
export const STUDIO_WINDOWS = {
  lanes: { title: "Lanes", description: "Everything comes in through a lane: one kind of file you add again and again, like a front photo each morning, or one live input such as a screen share, weather feed, sensor or webhook. Say what goes in it and ARGUS sets it up and links it to your products." },
  products: { title: "Products", description: "Pick the data products this project builds from its sources. Each one becomes a scene in the Program." },
  observatory: { title: "Observatory", description: "Everything ARGUS did for this project: every Meta model call with what it saw and answered, every code step and the Observations it wrote, every tool Ask ARGUS used." },
  agents: { title: "Agents", description: "Let Claude Code, Muse or any MCP client set up and read your projects for you, over MCP. It acts as you, on your own projects only." },
} as const;

export type StudioWindowId = keyof typeof STUDIO_WINDOWS;
export type StudioWindows = Partial<Record<StudioWindowId, React.ReactNode>>;

const OPEN = "argus:studio-window";

/** Open a setup window from anywhere in the studio, e.g. the Sources dock's + Lane button. The owner bar listens. */
export const openStudioWindow = (id: StudioWindowId) => window.dispatchEvent(new CustomEvent<StudioWindowId>(OPEN, { detail: id }));

export function onStudioWindow(fn: (id: StudioWindowId) => void) {
  const h = (e: Event) => fn((e as CustomEvent<StudioWindowId>).detail);
  window.addEventListener(OPEN, h);
  return () => window.removeEventListener(OPEN, h);
}

export function StudioWindow({ id, open, onOpenChange, children }: { id: StudioWindowId; open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  const w = STUDIO_WINDOWS[id];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-4rem)] w-[min(56rem,calc(100%-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b bg-card px-5 py-3">
          <DialogTitle className="font-mono text-xs uppercase tracking-wider">{w.title}</DialogTitle>
          <DialogDescription>{w.description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens another setup window, e.g. Lanes from inside Sources. */
export function OpenWindowButton({ id, children, className }: { id: StudioWindowId; children: React.ReactNode; className?: string }) {
  return <button type="button" onClick={() => openStudioWindow(id)} className={className ?? "border px-3 py-1.5 text-sm text-muted-foreground hover:border-electric hover:text-foreground"}>{children}</button>;
}
