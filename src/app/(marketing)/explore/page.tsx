import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter } from "@/components/landing/cta-footer";
import { SharedCard } from "@/components/landing/explore-teaser";
import { sharedList } from "@/components/landing/explore-data";

export const metadata: Metadata = {
  title: "Explore — ARGUS",
  description: "Projects people chose to share: their data products, the rows behind them, and a replay of every source and agent.",
};

export default function ExplorePage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6">
        <p className="mb-4 font-mono text-xs text-muted-foreground">Explore</p>
        <h1 className="text-balance text-4xl font-medium tracking-tight sm:text-6xl">Shared projects</h1>
        <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">
          Each one is a real ARGUS project its owner made public. Open it to see the data products, download the rows, and replay how the sources and agents produced them.
        </p>
        <Suspense fallback={<div aria-busy="true" className="mt-10 h-48 animate-pulse bg-muted" />}>
          <List />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function List() {
  const shared = await sharedList();
  if (!shared.length) {
    return (
      <p className="mt-10 border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nothing shared yet. Share one of yours from <Link href="/projects" className="text-electric underline">your projects</Link>.
      </p>
    );
  }
  return (
    <div className="mt-10 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {shared.map((p) => <SharedCard key={p.slug} p={p} />)}
    </div>
  );
}
