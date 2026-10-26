import { Suspense } from "react";
import { CtaFooter } from "@/components/landing/cta-footer";
import { DataProducts } from "@/components/landing/data-products";
import { ExploreTeaser } from "@/components/landing/explore-teaser";
import { Hero } from "@/components/landing/hero";
import { OneStream } from "@/components/landing/one-stream";
import { Pipeline } from "@/components/landing/pipeline";
import { Sources } from "@/components/landing/sources";
import { UseCases } from "@/components/landing/use-cases";

export default function Home() {
  return (
    <>
      <main className="flex-1">
        <Hero />
        <DataProducts />
        <OneStream />
        <Sources />
        <UseCases />
        <Pipeline />
        <Suspense fallback={null}>
          <ExploreTeaser />
        </Suspense>
      </main>
      <CtaFooter />
    </>
  );
}
