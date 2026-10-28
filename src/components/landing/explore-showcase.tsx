import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { ReplayCard } from "./replay-card";
import type { SharedProject } from "@/lib/explore";

export function LandingExplore({ projects = [] }: { projects?: SharedProject[] }) {
  return (
    <div className="mt-6 w-full sm:mt-8">
      <div className="text-left">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="flex items-center gap-3 text-xl font-medium tracking-tight"><Compass className="size-5 shrink-0 text-electric" aria-hidden="true" /> Explore data products by creators</h2>
          <Link href="/explore" className="inline-flex items-center gap-1 text-sm text-electric underline-offset-4 hover:underline">See all <ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        <div className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {projects.slice(0, 5).map((project, i) => <ReplayCard key={project.slug} p={project} priority={i < 3} />)}
          {projects.length === 0 && <p className="grid aspect-video place-items-center rounded-xl border border-dashed p-6 text-sm text-muted-foreground sm:col-span-2">No shared projects yet.</p>}
          <Link href="/explore" className="group flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card p-6 text-center text-sm font-medium transition-[background-color,border-color] hover:border-electric/60 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <span className="grid size-12 place-items-center rounded-full bg-electric/15 text-electric transition-transform group-hover:scale-110"><ArrowRight className="size-5" aria-hidden="true" /></span>
            Explore more replays
          </Link>
        </div>
      </div>
    </div>
  );
}
