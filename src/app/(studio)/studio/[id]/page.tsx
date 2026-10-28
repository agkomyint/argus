import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AskArgus } from "@/components/assistant/ask-argus";
import { PublicStudio } from "@/components/explore/public-studio";
import { AgentConnectWindow } from "@/components/studio/agent-connect-window";
import { ObservatoryWindow } from "@/components/studio/observatory-window";
import { OwnerBar } from "@/components/studio/owner-bar";
import { ProductManager } from "@/components/studio/product-manager";
import { LaneManager, laneSetups } from "@/components/studio/lane-manager";
import { StudioSkeleton, WindowLoading } from "@/components/studio/studio-skeleton";
import { AutoRefresh } from "@/components/workspace/pipeline-controls";
import { db } from "@/db";
import { jobs, uploads } from "@/db/schema";
import { askProjects } from "@/lib/ask-projects";
import { loadOwnerView } from "@/lib/explore";
import { loadProductData, productLanes } from "@/lib/product-data";
import { enabledProducts } from "@/lib/project-reads";
import { kindLabel } from "@/lib/projects";
import { loadReplay } from "@/lib/replay";
import { getAccount } from "@/lib/session";
import { studioLanes } from "@/lib/studio-lanes";
import { loadStudioTimeline } from "@/lib/studio-timeline";

export const metadata: Metadata = { title: "ARGUS Studio" };

/** ARGUS Studio for one project, full screen. Each project the user owns has its own. */
export default function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="h-dvh">
      <Suspense fallback={<StudioSkeleton />}>
        <ProjectStudio params={params} />
      </Suspense>
    </div>
  );
}

/**
 * Everything here is this project's own: its sources, its Observations, its model calls and its media.
 * Nothing is simulated. It opens on the latest moment and refreshes while jobs are still running.
 */
async function ProjectStudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The project's reads start alongside the sign-in check instead of after it, which saves a round trip.
  // Nothing they return is shown unless the project turns out to belong to the person signed in.
  const reads = loadStudio(id);
  reads.catch(() => {});
  const account = await getAccount();
  if (!account) redirect("/login");
  const project = account.projects.find((p) => p.id === id);
  if (!project) redirect("/projects");

  const [{ products, datasets, replay, view, lanes, timeline, busy, up }, ask, setup] = await Promise.all([
    reads,
    askProjects(account.projects),
    laneSetups(project.id, project.agentLevel, project.frequency),
  ]);
  // Everything comes in through a lane, so a project with none opens on the Lanes window.
  const nothingConnected = !lanes.length && !up;

  return (
    <>
      <AutoRefresh active={!!busy} everyMs={4000} />
      <PublicStudio
        project={{ slug: project.shareSlug ?? "", name: project.name, kind: kindLabel(project.kind), owner: account.user.name, createdAt: project.createdAt.getTime(), sharedAt: (project.sharedAt ?? project.createdAt).getTime() }}
        replay={replay}
        products={products.map((p, i) => ({ id: p.id, name: p.name, summary: p.summary, data: datasets[i] }))}
        view={view}
        timeline={timeline}
        owner={{
          exportBase: `/api/studio/${project.id}/export`,
          lanes,
          laneSetup: setup,
          bar: (
            <OwnerBar
              key="owner"
              project={{ id: project.id, name: project.name, slug: project.shareSlug, media: project.shareMedia }}
              open={nothingConnected ? "lanes" : null}
              ask={<AskArgus projects={ask} current={project.id} />}
              // Each window loads on its own, so the studio shows as soon as its own data is in.
              windows={{
                lanes: <Suspense fallback={<WindowLoading label="lanes" />}><LaneManager projectId={project.id} agentLevel={project.agentLevel} frequency={project.frequency} /></Suspense>,
                products: <Suspense fallback={<WindowLoading label="products" />}><ProductManager projectId={project.id} /></Suspense>,
                observatory: <Suspense fallback={<WindowLoading label="the Observatory" />}><ObservatoryWindow projectId={project.id} /></Suspense>,
                agents: <Suspense fallback={<WindowLoading label="agents" />}><AgentConnectWindow userId={account.user.id} /></Suspense>,
              }}
            />
          ),
        }}
      />
    </>
  );
}

/** Everything the studio itself shows for one project, read in one wave. The caller checks who may see it. */
async function loadStudio(projectId: string) {
  // The datasets start as soon as the product list is in, alongside everything else.
  const productsP = enabledProducts(projectId);
  const [products, datasets, replay, view, lanes, timeline, [busy], [up]] = await Promise.all([
    productsP,
    Promise.all([productsP, productLanes(projectId)]).then(([ps, lanes]) => Promise.all(ps.map((p) => loadProductData(projectId, p, 500, lanes)))),
    loadReplay(projectId, "owner"),
    loadOwnerView(projectId),
    studioLanes(projectId),
    loadStudioTimeline(projectId, "owner"),
    db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.projectId, projectId), inArray(jobs.status, ["queued", "running"]))).limit(1),
    db.select({ id: uploads.id }).from(uploads).where(eq(uploads.projectId, projectId)).limit(1),
  ]);
  return { products, datasets, replay, view, lanes, timeline, busy, up };
}
