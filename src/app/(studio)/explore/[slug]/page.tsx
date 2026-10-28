import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PublicStudio } from "@/components/explore/public-studio";
import { StudioSkeleton } from "@/components/studio/studio-skeleton";
import { getShared, loadShareView, publicDatasets, sharedTag } from "@/lib/explore";
import { loadProductData, productLanes } from "@/lib/product-data";
import { kindLabel } from "@/lib/projects";
import { loadReplay } from "@/lib/replay";
import { loadStudioTimeline } from "@/lib/studio-timeline";

export const metadata: Metadata = { title: "Shared project — ARGUS Studio" };

/** A shared project as a read-only ARGUS Studio: one screen, played from the first minute. No sign-in, no model calls. */
export default function SharedProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <div className="h-dvh">
      <Suspense fallback={<StudioSkeleton />}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shared = await sharedStudio(slug);
  if (!shared) notFound();
  return <PublicStudio {...shared} autoplay />;
}

/**
 * Everything a shared replay shows, read once and kept for a minute or so: every visitor sees the same replay,
 * so the next one is served from the cache instead of the database. Turning sharing or media off clears it
 * at once (see the share actions), so a stale copy never shows what the owner has taken back.
 */
async function sharedStudio(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(sharedTag(slug));
  const p = await getShared(slug);
  if (!p) return null;
  const [replay, datasets, view, timeline] = await Promise.all([
    loadReplay(p.id, "public"),
    productLanes(p.id).then((lanes) => Promise.all(p.products.map(async (prod) => publicDatasets(await loadProductData(p.id, prod, 500, lanes), p.shareMedia)))),
    loadShareView(p.id, slug, p.shareMedia),
    loadStudioTimeline(p.id, "public"),
  ]);
  return {
    project: { slug, name: p.name, kind: kindLabel(p.kind), owner: p.owner, createdAt: p.createdAt.getTime(), sharedAt: p.sharedAt!.getTime() },
    replay,
    products: p.products.map((prod, i) => ({ id: prod.id, name: prod.name, summary: prod.summary, data: datasets[i] })),
    view,
    timeline,
    start: replay?.start,
  };
}
