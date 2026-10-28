import type { Metadata } from "next";
import { ASK_PROJECTS, ASK_RECORDED } from "@/components/assistant/ask-samples";
import { DECK } from "@/components/design/project-kit";
import { ProjectDeck } from "@/components/workspace/project-deck";
import { pickableProducts } from "@/lib/pickable";

export const metadata: Metadata = { title: "Projects preview — ARGUS Studio" };

/** PRJ-01 at its real size: the whole viewport, as /projects shows it. */
export default function ProjectsPreviewPage() {
  return (
    <div className="h-dvh">
      <ProjectDeck slides={DECK} start={0} items={pickableProducts()} ask={ASK_PROJECTS} askRecorded={ASK_RECORDED} showSample className="h-full" />
    </div>
  );
}
