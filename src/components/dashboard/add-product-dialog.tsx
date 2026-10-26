"use client";

import { Check, Plus, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { setProductEnabled } from "@/app/actions";
import { ProductPreview } from "@/components/widgets/product-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type AddableProduct = { id: string; name: string; summary: string; kind: string; category: string; needs: string[] };

export function AddProductDialog({ items }: { items: AddableProduct[] }) {
  const [open, setOpen] = useState(false);
  // Snapshot on open: adding revalidates the page and would otherwise pull the card out from under the pointer.
  const [shown, setShown] = useState(items);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const cats = useMemo(() => [...new Set(shown.map((p) => p.category))], [shown]);
  const list = shown.filter((p) => {
    if (cat && p.category !== cat) return false;
    const s = q.trim().toLowerCase();
    return !s || `${p.name} ${p.summary} ${p.needs.join(" ")}`.toLowerCase().includes(s);
  });

  const add = (id: string) => {
    setBusy(id);
    start(async () => {
      await setProductEnabled(id, true);
      setAdded((a) => new Set(a).add(id));
      setBusy(null);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) { setShown(items); setAdded(new Set()); setQ(""); setCat(null); }
        setOpen(o);
      }}
    >
      <DialogTrigger render={<Button />}><Plus className="size-4" />Add a data product</DialogTrigger>
      <DialogContent className="flex h-[min(52rem,calc(100vh-2rem))] w-[min(72rem,calc(100%-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>Add a data product</DialogTitle>
          <DialogDescription>Each card shows the widget you get and the sources it needs. Add as many as you like.</DialogDescription>
          <div className="mt-3 flex flex-col gap-3">
            <InputGroup>
              <InputGroupAddon><Search className="size-4" /></InputGroupAddon>
              <InputGroupInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, e.g. people, crack, traffic" aria-label="Search data products" />
            </InputGroup>
            {cats.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {[null, ...cats].map((c) => (
                  <button
                    key={c ?? "all"}
                    type="button"
                    onClick={() => setCat(c)}
                    aria-pressed={cat === c}
                    className={cn("border px-2.5 py-1 text-xs", cat === c ? "border-electric text-electric" : "text-muted-foreground hover:text-foreground")}
                  >
                    {c ?? `All (${shown.length})`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing matches “{q}”.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => {
                const done = added.has(p.id);
                return (
                  <li key={p.id} className={cn("flex flex-col border", done && "border-signal")}>
                    <ProductPreview productId={p.id} kind={p.kind} data={[]} />
                    <div className="flex flex-1 flex-col p-3">
                      <p className="font-medium">{p.name}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.needs.map((n) => <Badge key={n} variant="outline">{n}</Badge>)}
                      </div>
                      <div className="mt-auto pt-3">
                        <Button size="sm" variant={done ? "outline" : "default"} disabled={done || busy === p.id} onClick={() => add(p.id)} className="w-full">
                          {done ? <><Check className="size-4" />Added</> : busy === p.id ? "Adding…" : <><Plus className="size-4" />Add</>}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
