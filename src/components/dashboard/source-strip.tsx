import Link from "next/link";
import { SOURCE_LABEL, sourcesFor, type SourceKind } from "@/lib/product-sources";
import { cn } from "@/lib/utils";

/** The whole source story for a product in one line: what it needs, and whether that is linked yet. */
export function SourceStrip({ productId, linked, href }: { productId: string; linked: Record<SourceKind, boolean>; href: string }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {sourcesFor(productId).filter((n) => n.required || linked[n.kind]).map((n) => {
        const on = linked[n.kind];
        return (
          <li key={n.kind}>
            <Link href={href} title={n.why} className={cn("inline-flex items-center gap-1.5 border px-2 py-1 text-xs hover:bg-accent/50", on ? "text-foreground" : "border-dashed text-muted-foreground")}>
              <span className={cn("size-1.5", on ? "bg-signal" : "bg-muted-foreground")} />
              {SOURCE_LABEL[n.kind]}
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{on ? "linked" : "not linked"}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
