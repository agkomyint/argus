import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/workspace/page-header";
import { cn } from "@/lib/utils";
import { SOLUTIONS } from "@/lib/solutions";
import { getProduct } from "@/products";

export const metadata: Metadata = { title: "New project — ARGUS" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader
        title="Start a project"
        description="Pick a template, which is a ready-made group of data products, or choose individual data products yourself. Nothing is connected until you say so."
      />

      <Link href="/projects/new/catalog" className="mb-10 flex flex-col gap-1 border p-5 hover:bg-accent/40">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Build your own</span>
        <span className="text-lg font-medium">Pick data products one by one</span>
        <span className="text-sm text-muted-foreground">Choose any combination, for example people count plus gender split, and use them on uploads or a shared screen.</span>
        <span className="mt-2 text-sm text-electric">Open the catalog →</span>
      </Link>

      <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Or start from a template</h2>
      <ul className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {SOLUTIONS.map((s) => {
          const names = s.products.map((id) => getProduct(id)?.name ?? id);
          const href = s.needs.length ? `/projects/new/${s.id}` : `/projects/new/catalog?template=${s.id}`;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.category}</span>
                <span className={cn("px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", s.live ? "bg-electric text-white" : "bg-muted text-muted-foreground")}>{s.live ? "Template" : "Soon"}</span>
              </div>
              <h3 className="mt-4 text-lg font-medium">{s.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.blurb}</p>
              {names.length > 0 && <p className="mt-3 font-mono text-[11px] text-muted-foreground">Includes: {names.join(" + ")}</p>}
              <p className={cn("mt-auto pt-6 text-sm", s.live ? "text-electric" : "text-muted-foreground")}>{s.live ? "Use this template →" : "Not available yet"}</p>
            </>
          );
          return (
            <li key={s.id} className="flex bg-background">
              {s.live ? (
                <Link href={href} className="flex min-h-56 w-full flex-col p-5 hover:bg-accent/40">{body}</Link>
              ) : (
                <div className="flex min-h-56 w-full flex-col p-5 opacity-60">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <Link href="/projects" className="mt-8 inline-block text-sm text-muted-foreground underline hover:text-foreground">
        Back to projects
      </Link>
    </>
  );
}
