import type { Metadata } from "next";
import { PUBLIC_PRODUCTS, PUBLIC_PROJECT, PUBLIC_REPLAY, PUBLIC_TIMELINE, PUBLIC_VIEW } from "@/components/explore/public-samples";
import { PublicStudio } from "@/components/explore/public-studio";
import { OwnerBar } from "@/components/studio/owner-bar";
import { LanesWindowPreview } from "@/components/studio/lane-kit";

export const metadata: Metadata = { title: "ARGUS Studio preview" };

/** STU-01 at its real size, on the /design fixture: the whole viewport, nothing around it. */
export default function StudioPreviewPage() {
  return (
    <div className="h-dvh">
      <PublicStudio
        project={PUBLIC_PROJECT} replay={PUBLIC_REPLAY} products={PUBLIC_PRODUCTS} view={PUBLIC_VIEW} timeline={PUBLIC_TIMELINE}
        owner={{ exportBase: "#", bar: <OwnerBar project={{ id: "design", name: PUBLIC_PROJECT.name, slug: null, media: false }} windows={{ lanes: <LanesWindowPreview /> }} /> }}
        className="h-full"
      />
    </div>
  );
}
