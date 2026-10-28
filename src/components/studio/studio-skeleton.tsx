import { cn } from "@/lib/utils";

const bar = (c?: string, key?: number) => <span key={key} className={cn("block animate-pulse bg-muted", c)} />;

/**
 * What the studio shows while a project loads: the same frame as the studio itself (lanes, preview and story,
 * data products, timeline), each panel with the outline of what will fill it, so nothing jumps when it arrives.
 */
export function StudioSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("@container flex size-full min-h-0 flex-col overflow-hidden bg-background", className)} aria-busy="true" aria-label="Loading studio">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b bg-card px-3">
        {bar("h-3 w-20")}<span className="h-4 w-px bg-border" aria-hidden />{bar("h-3 w-40")}
        <span className="ml-auto flex gap-2">{bar("h-5 w-16")}{bar("h-5 w-16")}{bar("h-5 w-20")}</span>
      </div>
      <div className="flex h-8 shrink-0 border-b bg-card @4xl:hidden" />

      <div className="grid min-h-0 flex-1 gap-px bg-border @4xl:grid-cols-[16rem_minmax(0,1fr)_var(--rail,18rem)] @7xl:grid-cols-[18rem_minmax(0,1fr)_var(--rail,21rem)]">
        <Panel title="w-12" className="hidden @4xl:flex">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 border bg-background p-2">
              <div className="flex items-center gap-2">{bar("size-4")}{bar("h-3 flex-1")}</div>
              <div className="grid grid-cols-4 gap-1">{[0, 1, 2, 3].map((j) => bar(cn("aspect-square", j > 2 - i && "opacity-40"), j))}</div>
            </div>
          ))}
        </Panel>

        <div className="flex min-h-0 flex-col gap-px">
          <div className="relative flex-[3] bg-black">
            <span className="absolute inset-x-3 top-2 flex gap-2">{bar("h-3 w-24 bg-white/10")}</span>
          </div>
          <Panel title="w-28" className="flex flex-[2]">
            <div className="flex gap-2">{bar("h-5 w-16")}{bar("h-5 w-16")}{bar("h-5 w-16")}</div>
            {bar("h-3 w-3/4")}{bar("h-3 w-1/2")}
          </Panel>
        </div>

        <Panel title="w-24" className="hidden @4xl:flex">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 border bg-background p-2">
              <div className="flex items-center justify-between">{bar("h-3 w-28")}{bar("h-4 w-8")}</div>
              {bar(i === 0 ? "h-24 w-full" : "h-6 w-full")}
            </div>
          ))}
        </Panel>
      </div>

      <div className="flex h-44 shrink-0 flex-col gap-2 border-t bg-card p-3">
        <div className="flex items-center gap-3">{bar("size-6")}{bar("h-3 w-32")}<span className="ml-auto flex gap-2">{bar("h-5 w-14")}{bar("h-5 w-14")}{bar("h-5 w-14")}</span></div>
        {bar("h-2 w-full")}
        {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3">{bar("h-3 w-20")}{bar("h-4 flex-1 opacity-60")}</div>)}
      </div>
      <div className="h-6 shrink-0 border-t bg-card" />
    </div>
  );
}

function Panel({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-h-0 flex-col gap-2 overflow-hidden bg-card p-2", className)}>
      <div className="flex h-5 items-center">{bar(cn("h-3", title))}</div>
      {children}
    </div>
  );
}

/** A studio window whose contents are still loading. The studio opens without waiting for its windows. */
export function WindowLoading({ label }: { label: string }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label={`Loading ${label}`}>
      {bar("h-4 w-40")}{bar("h-3 w-3/4")}{bar("h-24 w-full")}{bar("h-24 w-full")}
    </div>
  );
}
