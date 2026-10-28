import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-mono text-sm font-medium tracking-[0.2em]", className)}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
        <path d="M2 20 11 3h2l9 17h-4L12 8 6 20Z" className="fill-electric" />
        <path d="m8 17 2-4h4l2 4Z" className="fill-signal" />
      </svg>
      ARGUS
    </span>
  );
}

