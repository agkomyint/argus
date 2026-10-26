import { cn } from "@/lib/utils";

/** Anchor id for a surface code, so /design#PRD-01 deep-links. */
export const surfaceId = (code: string) => code.toLowerCase();

/**
 * One named interface surface on the design page. The code is the name the team uses
 * ("make PRD-01 wider"), the `used` line says where it appears in the product.
 */
export function Surface({ code, name, used, children, className }: { code: string; name: string; used: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={surfaceId(code)} className="scroll-mt-20 border-t py-8">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="bg-electric px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-background">{code}</span>
        <h3 className="text-lg font-medium">{name}</h3>
        <p className="w-full font-mono text-[11px] text-muted-foreground sm:ml-auto sm:w-auto">Used in {used}</p>
      </header>
      <div className={cn("min-w-0", className)}>{children}</div>
    </section>
  );
}

export function Group({ id, title, blurb, children }: { id: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 pt-12">
      <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Swatch({ name, value, note }: { name: string; value: string; note?: string }) {
  return (
    <li className="border">
      <div className="h-14" style={{ background: value }} />
      <div className="p-2">
        <p className="font-mono text-xs">{name}</p>
        {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      </div>
    </li>
  );
}
