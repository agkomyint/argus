import { inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { projectProducts } from "@/db/schema";
import { ProjectSlides, type Slide } from "@/components/dashboard/project-slides";
import { agentLevel, money } from "@/lib/agent-levels";
import { loadEngine } from "@/lib/engine";
import { pickableProducts } from "@/lib/pickable";
import { loadDatasets } from "@/lib/product-data";
import { loadLinked } from "@/lib/product-link";
import { suggestSources } from "@/lib/product-sources";
import { kindLabel } from "@/lib/projects";
import { PROJECT_COOKIE, getAccount } from "@/lib/session";
import { getProduct } from "@/products";

export const metadata: Metadata = { title: "Projects — ARGUS" };

/** Widgets shown per slide; the rest are counted. */
const PER_SLIDE = 4;

export default async function ProjectsPage() {
  const account = await getAccount();
  if (!account) redirect("/login");

  const ids = account.projects.map((p) => p.id);
  const [enabled, jar] = await Promise.all([
    ids.length ? db.select().from(projectProducts).where(inArray(projectProducts.projectId, ids)).orderBy(projectProducts.enabledAt) : [],
    cookies(),
  ]);

  const slides: Slide[] = await Promise.all(
    account.projects.map(async (p) => {
      const mine = enabled.flatMap((r) => {
        const prod = r.projectId === p.id ? getProduct(r.productId) : undefined;
        return prod?.status === "supported" ? [prod] : [];
      });
      const shown = mine.slice(0, PER_SLIDE);
      const [data, engine, linked] = await Promise.all([
        Promise.all(shown.map((prod) => loadDatasets(p.id, prod.observationTypes, 120))),
        loadEngine(p.id, { level: p.agentLevel, frequency: p.frequency }),
        loadLinked(p.id),
      ]);
      return {
        id: p.id,
        name: p.name,
        kind: kindLabel(p.kind),
        shareSlug: p.shareSlug,
        products: shown.map((prod, i) => ({ id: prod.id, name: prod.name, kind: prod.kind, rows: data[i].reduce((a, d) => a + d.total, 0), data: data[i] })),
        more: mine.length - shown.length,
        sources: engine.sources.map((s) => ({ key: s.key, name: s.name, state: s.state, done: s.done, total: s.total, unit: s.unit })),
        suggestions: suggestSources(mine.map((m) => m.id), linked, (id) => getProduct(id)?.name ?? id),
        level: agentLevel(p.agentLevel).name,
        cost: engine.summary.costPerHour ? `${money(engine.summary.costPerHour)}/h` : `${agentLevel(p.agentLevel).accuracy}% accuracy`,
      };
    }),
  );
  const active = ids.indexOf(jar.get(PROJECT_COOKIE)?.value ?? "");

  return <ProjectSlides slides={slides} start={slides.length === 0 ? 0 : Math.max(active, 0)} items={pickableProducts()} />;
}
