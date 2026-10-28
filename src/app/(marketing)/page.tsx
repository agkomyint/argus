import Link from "next/link";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingDocs } from "@/components/docs/docs";
import { LandingProjectTabs } from "@/components/landing/project-tabs";
import { LandingExamples } from "@/components/landing/examples";
import { LandingHero } from "@/components/landing/hero";
import { Logo } from "@/components/landing/logo";

export default function Home() {
  return (
    <main className="landing-page fixed inset-0 z-[100] overflow-y-auto bg-background">
      <header className="bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="ARGUS home"><Logo /></Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <a href="https://x.com/itsrealakm" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span className="hidden sm:inline">A solo project by Aung Ko Myint</span><svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.4l7.2-8.3L.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L6.2 3.9H4.4L17.8 20Z" /></svg><span className="sr-only">Aung Ko Myint on X (opens in a new tab)</span></a>
          <Link href="/projects" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Go to Projects <span aria-hidden="true" className="ml-2">↗</span></Link>
          </div>
        </div>
      </header>
      <LandingHero />
      <LandingExamples />
      <LandingProjectTabs />
      <LandingDocs />
      <LandingFooter />
    </main>
  );
}















