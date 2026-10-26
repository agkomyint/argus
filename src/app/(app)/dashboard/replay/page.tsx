import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReplayPlayer } from "@/components/dashboard/replay-player";
import { ShareProjectDialog } from "@/components/dashboard/share-project-dialog";
import { loadReplay } from "@/lib/replay";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Replay — ARGUS" };

export default async function ReplayPage() {
  const ws = (await getWorkspace())!;
  const data = (await loadReplay(ws.project.id))!;

  return (
    <>
      <PageHeader title="Replay" description="Everything this project's sources and agents did, from the day you made it until now. Press play, or drag to any moment.">
        <ShareProjectDialog id={ws.project.id} name={ws.project.name} slug={ws.project.shareSlug} />
      </PageHeader>
      <ReplayPlayer data={data} />
    </>
  );
}
