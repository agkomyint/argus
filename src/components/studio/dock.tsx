import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

/** One studio panel, like an OBS dock: a title bar with actions, a scrolling body, an optional footer. */
export function Dock({ title, icon: Icon, actions, footer, children, className, bodyClassName }: {
  title: string; icon?: LucideIcon; actions?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={cn("flex size-full min-h-0 min-w-0 flex-col bg-background", className)}>
      <header className="flex h-7 shrink-0 items-center gap-1.5 border-b bg-card px-2">
        {Icon && <Icon className="size-3 text-muted-foreground" />}
        <h3 className={cn(label, "truncate text-foreground/80")}>{title}</h3>
        <div className="ml-auto flex items-center gap-0.5">{actions}</div>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]", bodyClassName)}>{children}</div>
      {footer && <footer className="flex h-7 shrink-0 items-center gap-0.5 border-t bg-card px-1">{footer}</footer>}
    </section>
  );
}
