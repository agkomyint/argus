import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NewProjectForm } from "@/components/dashboard/new-project-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { getSolution } from "@/lib/solutions";

export const metadata: Metadata = { title: "Choose sources — ARGUS" };

async function Step({ params }: { params: Promise<{ product: string }> }) {
  const solution = getSolution((await params).product);
  if (!solution?.live) notFound();
  return (
    <>
      <PageHeader title={`${solution.name}: bring these kinds of data`} description="Start with the one required source. Each extra source makes alerts more certain, and you can add them later." />
      <NewProjectForm product={solution.id} needs={solution.needs} />
      <Link href="/projects/new" className="mt-8 inline-block text-sm text-muted-foreground underline hover:text-foreground">
        Choose a different product
      </Link>
    </>
  );
}

export default function Page({ params }: { params: Promise<{ product: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Step params={params} />
    </Suspense>
  );
}
