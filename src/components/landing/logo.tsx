import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-mono text-sm font-medium tracking-[0.2em]", className)}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
        <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7S18.5 19 12 19 1.5 12 1.5 12Z" className="stroke-electric" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3" className="fill-signal" />
      </svg>
      ARGUS
    </span>
  );
}
