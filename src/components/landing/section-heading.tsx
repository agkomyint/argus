import { cn } from "@/lib/utils";

/** Editorial section: a narrow label rail on the left, content on the right. */
export function Section({
  id,
  index,
  label,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  index: string;
  label: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className="scroll-mt-14 border-t">
      <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-6 px-4 py-20 sm:px-6 lg:grid-cols-[11rem_1fr]">
        <div className="font-mono text-xs text-muted-foreground lg:pt-3">
          <span className="text-foreground">{index}</span> <span className="ml-2">{label}</span>
        </div>
        <div className={cn("min-w-0", className)}>
          <h2 className="max-w-3xl text-balance text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{title}</h2>
          {intro && <p className="mt-4 max-w-2xl text-pretty text-muted-foreground">{intro}</p>}
          <div className="mt-12">{children}</div>
        </div>
      </div>
    </section>
  );
}
