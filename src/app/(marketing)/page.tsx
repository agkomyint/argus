import { Suspense } from "react";
import { SiteFooter } from "@/components/landing/cta-footer";
import { ExploreTeaser } from "@/components/landing/explore-teaser";
import { Hero } from "@/components/landing/hero";

export default function Home() {
  return (
    <>
      <main className="flex-1">
        <Hero />
        <Suspense fallback={null}>
          <ExploreTeaser />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
