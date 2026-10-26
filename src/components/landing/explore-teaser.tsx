import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { listShared } from "@/lib/explore";
import { kindLabel } from "@/lib/projects";
import { Section } from "./section-heading";

type Shared = Awaited<ReturnType<typeof listShared>>[number];

/** One shared project as a card: what it makes and how much data it has made. */
export function SharedCard({ p }: { p: Shared }) {
  return (
    <Link href={`/explore/${p.slug}`} className="group flex flex-col gap-3 bg-background p-5 transition-colors hover:bg-accent/30">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{kindLabel(p.kind)}</span>
      <span className="text-lg font-medium leading-snug">{p.name}</span>
      <span className="flex flex-wrap gap-1.5">
        {p.products.slice(0, 3).map((n) => (
          <span key={n} className="border px-1.5 py-0.5 text-xs text-muted-foreground">{n}</span>
        ))}
        {p.products.length > 3 && <span className="px-1 py-0.5 text-xs text-muted-foreground">+{p.products.length - 3}</span>}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 pt-2 font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{p.rows.toLocaleString("en-US")} rows · by {p.owner}</span>
        <span className="text-electric group-hover:underline">Watch replay →</span>
      </span>
    </Link>
  );
}

/** Landing section: the newest projects people chose to share. Hidden until someone shares one. */
export async function ExploreTeaser() {
  const shared = await listShared(3);
  if (!shared.length) return null;
  return (
    <Section
      id="explore"
      index="07"
      label="Explore"
      title="Watch real projects run."
      intro="People share their projects here: every data product it makes, the rows behind it, and a replay of each source and agent from the first day to now."
    >
      <div className="grid gap-px border bg-border md:grid-cols-3">
        {shared.map((p) => <SharedCard key={p.slug} p={p} />)}
      </div>
      <Link href="/explore" className="mt-6 inline-flex items-center gap-1.5 text-sm text-electric underline-offset-4 hover:underline">
        All shared projects <ArrowRight className="size-4" />
      </Link>
    </Section>
  );
}
