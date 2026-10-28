import { inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { projectProducts } from "@/db/schema";
import { ProjectDeck, type Slide } from "@/components/workspace/project-deck";
import { SignOutButton } from "@/components/workspace/sign-out-button";
import { agentLevel, money } from "@/lib/agent-levels";
import { askProjects } from "@/lib/ask-projects";
import { loadSources } from "@/lib/engine";
import { pickableProducts } from "@/lib/pickable";
import { loadProductData, productLanes } from "@/lib/product-data";
import { kindLabel } from "@/lib/projects";
import { PROJECT_COOKIE, getAccount } from "@/lib/session";
import { estimate } from "@/lib/tune";
import { getProduct } from "@/products";

export const metadata: Metadata = { title: "Projects — ARGUS Studio" };

/** Products drawn per slide; the rest are counted and live in the studio. */
const PER_SLIDE = 12;

export default function ProjectsPage() {
  return (
    <div className="h-dvh">
      <Suspense fallback={<div aria-busy="true" className="h-full animate-pulse bg-muted/40" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const account = await getAccount();
  if (!account) redirect("/login");

  const ids = account.projects.map((p) => p.id);
  const [enabled, jar, ask] = await Promise.all([
    ids.length ? db.select().from(projectProducts).where(inArray(projectProducts.projectId, ids)).orderBy(projectProducts.enabledAt) : [],
    cookies(),
    askProjects(account.projects),
  ]);

  const slides: Slide[] = await Promise.all(
    account.projects.map(async (p) => {
      const mine = enabled.flatMap((r) => {
        const prod = r.projectId === p.id ? getProduct(r.productId) : undefined;
        return prod?.status === "supported" ? [prod] : [];
      });
      const shown = mine.slice(0, PER_SLIDE);
      // Only the sources are shown here, so skip the full engine map and its extra queries.
      const [data, sources] = await Promise.all([
        productLanes(p.id).then((lanes) => Promise.all(shown.map((prod) => loadProductData(p.id, prod, 120, lanes)))),
        loadSources(p.id),
      ]);
      const costPerHour = sources.some((s) => s.type === "screen" && s.state === "working") ? estimate(p.agentLevel, p.frequency).cost : 0;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        kind: kindLabel(p.kind),
        shareSlug: p.shareSlug,
        shareMedia: p.shareMedia,
        products: shown.map((prod, i) => ({ id: prod.id, name: prod.name, kind: prod.kind, rows: data[i].reduce((a, d) => a + d.total, 0), data: data[i] })),
        more: mine.length - shown.length,
        sources: sources.map((s) => ({ key: s.key, name: s.name, state: s.state, done: s.done, total: s.total, unit: s.unit })),
        level: agentLevel(p.agentLevel).name,
        cost: costPerHour ? `${money(costPerHour)}/h` : `${agentLevel(p.agentLevel).accuracy}% accuracy`,
      };
    }),
  );
  const active = ids.indexOf(jar.get(PROJECT_COOKIE)?.value ?? "");

  const bar = (
    <>
      <span className="hidden font-mono text-[11px] text-muted-foreground lg:block">{account.user.email}</span>
      <SignOutButton />
    </>
  );
  return <ProjectDeck slides={slides} start={slides.length === 0 ? 0 : Math.max(active, 0)} items={pickableProducts()} bar={bar} ask={ask} className="h-full" />;
}
