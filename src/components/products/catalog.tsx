"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_LABEL, KINDS, STATUSES, type ProductCategory, type ProductKind, type ProductManifest, type ProductStatus } from "@/products";
import { KIND_META, STATUS_META } from "./badges";

type Filter<T> = T | "all";

export function Catalog({ products }: { products: ProductManifest[] }) {
  const [category, setCategory] = useState<Filter<ProductCategory>>("all");
  const [status, setStatus] = useState<Filter<ProductStatus>>("all");
  const [kind, setKind] = useState<Filter<ProductKind>>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (status === "all" || p.status === status) &&
        (kind === "all" || p.kind === kind) &&
        (!q || p.name.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q) || p.id.includes(q)),
    );
  }, [products, category, status, kind, query]);

  const countFor = (c: ProductCategory) => products.filter((p) => p.category === c).length;
  const grouped = category === "all" && !query && status === "all" && kind === "all";

  return (
    <div>
      {/* Filters */}
      <div className="sticky top-14 z-30 -mx-4 space-y-3 border-b bg-background/85 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap gap-x-5">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All <span className="text-muted-foreground">{products.length}</span>
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]} <span className="text-muted-foreground">{countFor(c)}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="pl-8" aria-label="Search products" />
          </div>
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[["all", "Any"], ...STATUSES.map((s) => [s, STATUS_META[s].label] as const)]}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Type
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Filter<ProductKind>)}
              className="h-8 border bg-background px-2 text-sm text-foreground"
            >
              <option value="all">Any</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_META[k].label}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto font-mono text-xs text-muted-foreground">{visible.length} shown</span>
        </div>
      </div>

      {/* Results */}
      {visible.length === 0 ? (
        <p className="py-20 text-center text-muted-foreground">No products match these filters.</p>
      ) : grouped ? (
        CATEGORIES.map((c) => {
          const list = visible.filter((p) => p.category === c);
          return (
            <section key={c} className="mt-12">
              <h2 className="text-lg font-medium">{CATEGORY_LABEL[c]}</h2>
              <p className="mb-3 font-mono text-xs text-muted-foreground">
                {list.filter((p) => p.status === "supported").length} supported · {list.length} total
              </p>
              <Grid list={list} />
            </section>
          );
        })
      ) : (
        <div className="mt-8">
          <Grid list={visible} />
        </div>
      )}
    </div>
  );
}

const STATUS_DOT = { supported: "bg-signal", planned: "bg-electric", research: "bg-muted-foreground/50" } as const;

function Grid({ list }: { list: ProductManifest[] }) {
  return (
    <ul className="border-t">
      {list.map((p) => (
        <li key={p.id} className="border-b">
          <Link
            href={`/products/${p.id}`}
            className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-3 gap-y-1 px-1 py-3 transition-colors hover:bg-accent/40 md:grid-cols-[2.5rem_minmax(0,1fr)_7rem_3rem_6.5rem] md:gap-x-4"
          >
            <span className="font-mono text-xs text-muted-foreground">{String(p.no).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className="font-medium">{p.name}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{p.summary}</span>
            </span>
            <span className="hidden font-mono text-xs text-muted-foreground md:block">{KIND_META[p.kind].label}</span>
            <span className="hidden font-mono text-xs text-muted-foreground md:block">{p.level}</span>
            <span className="flex items-center justify-end gap-2 font-mono text-xs md:justify-start">
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[p.status])} aria-hidden />
              {STATUS_META[p.status].label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors",
        active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "all";
  onChange: (v: T | "all") => void;
  options: (readonly [T | "all", string])[];
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <div className="flex border p-0.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={cn(
              "px-2.5 py-1 text-sm transition-colors",
              value === v ? "bg-accent text-foreground" : "hover:text-foreground",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
