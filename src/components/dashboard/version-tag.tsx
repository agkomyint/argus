import { cn } from "@/lib/utils";

/** Set from package.json in next.config.ts, so it moves with every `bun run release`. */
export const APP_VERSION = process.env.APP_VERSION || "dev";

/** The running ARGUS version, e.g. v0.1.0 or v0.2.0-rc.1. */
export function VersionTag({ version = APP_VERSION, className }: { version?: string; className?: string }) {
  const label = version === "dev" ? "dev" : `v${version}`;
  return (
    <span title={`ARGUS ${label}`} className={cn("border px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground", className)}>
      {label}
    </span>
  );
}
