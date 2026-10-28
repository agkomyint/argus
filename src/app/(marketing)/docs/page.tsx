import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/landing/cta-footer";
import { Docs } from "@/components/docs/docs";

export const metadata: Metadata = {
  title: "Docs — ARGUS",
  description: "How to watch a replay, make a project, add lanes, read what the AI did and share it, with screenshots of each step.",
};

export default function DocsPage() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6">
        <p className="mb-4 font-mono text-xs text-muted-foreground">Docs</p>
        <h1 className="text-balance text-4xl font-medium tracking-tight sm:text-6xl">Using ARGUS</h1>
        <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">
          ARGUS turns photos, video and live feeds into data products with Meta AI models, and records every step so you can check it.
          Start by <Link href="/explore" className="text-electric underline-offset-4 hover:underline">watching a replay</Link>, then make your own.
        </p>
        <div className="mt-12"><Docs /></div>
      </main>
      <SiteFooter />
    </>
  );
}
