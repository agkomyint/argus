import { Suspense } from "react";
import { LandingExplore } from "./explore-showcase";
import { LandingExploreData } from "./explore-data";

export function LandingHero() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 pb-12 pt-14 sm:min-h-[70vh] sm:px-6 sm:pb-24 sm:pt-32">
      <h1 className="max-w-5xl text-center text-balance text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl sm:leading-[0.98] lg:text-7xl">
        Personal Data products for the <span className="text-electric">superintelligence era.</span>
      </h1>
      <p className="mt-6 flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground sm:mt-10">
        <span className="h-px w-8 bg-electric" aria-hidden="true" /> Meta AI Hackathon 2026
      </p>
      <Suspense fallback={<LandingExplore />}><LandingExploreData /></Suspense>
    </section>
  );
}





