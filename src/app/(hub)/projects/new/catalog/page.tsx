import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GeneralProjectForm } from "@/components/workspace/general-project-form";
import { PageHeader } from "@/components/workspace/page-header";
import { getSolution } from "@/lib/solutions";
import { productsByStatus } from "@/products";

export const metadata: Metadata = { title: "Pick data products — ARGUS" };

export default function CatalogProjectPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const template = getSolution((await searchParams).template);
  const items = productsByStatus("supported").map((p) => ({ id: p.id, name: p.name, summary: p.summary, level: p.level }));
  return (
    <>
      <PageHeader
        title={template ? `${template.name} template` : "Pick data products"}
        description={template ? "This template switches on the products ticked below. Add or remove any before you create the project." : "Tick as many data products as you want. They work on uploads and on a shared screen, and you can change them later."}
      />
      <GeneralProjectForm items={items} preselected={template?.products ?? []} />
      <Link href="/projects/new" className="mt-8 inline-block text-sm text-muted-foreground underline hover:text-foreground">Back</Link>
    </>
  );
}
