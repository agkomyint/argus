import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HeroVisual } from "./hero-visual";

export function Hero() {
  return (
    <section className="pt-14">
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-20 sm:px-6 sm:pt-28">
        <p className="mb-6 font-mono text-xs text-muted-foreground">
          <span className="text-signal">●</span> ARGUS · Visual intelligence infrastructure
        </p>
        <h1 className="max-w-4xl text-balance text-5xl font-medium leading-[1.02] tracking-tight sm:text-7xl">
          Turn the physical world into intelligence.
        </h1>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Connect cameras, video streams, and visual datasets. Deploy AI agents that continuously observe, understand,
            map, and transform the world into actionable data products.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
              Launch Workspace <ArrowRight />
            </Link>
            <Link href="/dashboard" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 px-5")}>
              Explore Live Demo
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <HeroVisual />
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Fig. 1 — Simulated ingest: frame in, detections out, map and data product updating.
        </p>
      </div>
    </section>
  );
}
