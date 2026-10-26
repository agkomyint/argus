import type { Metadata } from "next";
import { Catalog } from "@/components/products/catalog";
import { KIND_META, LEVEL_META, STATUS_META } from "@/components/products/badges";
import { SiteFooter } from "@/components/landing/cta-footer";
import { CATEGORIES, KINDS, LEVELS, products, STATUSES } from "@/products";

export const metadata: Metadata = {
  title: "Data product catalog — ARGUS",
  description: "Every data product ARGUS supports today, and what is planned or under research.",
};

export default function ProductsPage() {
  const count = (s: (typeof STATUSES)[number]) => products.filter((p) => p.status === s).length;

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6">
        <p className="mb-4 font-mono text-xs text-muted-foreground">Catalog</p>
        <h1 className="text-balance text-4xl font-medium tracking-tight sm:text-6xl">Data products</h1>
        <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">
          Every product is declared by a manifest and classified three ways: what it is (type), how far it is from raw
          pixels (level), and whether we have built it (status).
        </p>

        <div className="mt-10 grid grid-cols-2 divide-x border-y sm:grid-cols-4">
          <Stat label="Products" value={products.length} />
          {STATUSES.map((s) => (
            <Stat key={s} label={STATUS_META[s].label} value={count(s)} tone={s} />
          ))}
        </div>

        {/* How to read the catalog */}
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          <Legend title="Type" hint="What it is">
            {KINDS.map((k) => (
              <Item key={k} term={KIND_META[k].label} text={KIND_META[k].description} />
            ))}
          </Legend>
          <Legend title="Level" hint="How processed">
            {LEVELS.map((l) => (
              <Item key={l} term={`${l} ${LEVEL_META[l].label}`} text={LEVEL_META[l].description} mono />
            ))}
          </Legend>
          <Legend title="Status" hint="What we support">
            {STATUSES.map((s) => (
              <Item key={s} term={STATUS_META[s].label} text={STATUS_META[s].description} />
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Grouped into {CATEGORIES.length} categories by what the product is used for.
            </p>
          </Legend>
        </div>

        <Catalog products={[...products]} />
      </main>
      <SiteFooter />
    </>
  );
}

const TONE = { supported: "text-signal", planned: "text-electric", research: "text-muted-foreground" } as const;

function Stat({ label, value, tone }: { label: string; value: number; tone?: keyof typeof TONE }) {
  return (
    <div className="px-4 py-4 first:pl-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-medium tabular-nums ${tone ? TONE[tone] : ""}`}>{value}</div>
    </div>
  );
}

function Legend({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{hint}</span>
      </div>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function Item({ term, text, mono }: { term: string; text: string; mono?: boolean }) {
  return (
    <div className="text-sm">
      <dt className={`inline font-medium ${mono ? "font-mono text-xs" : ""}`}>{term}</dt>
      <dd className="inline text-muted-foreground"> — {text}</dd>
    </div>
  );
}
