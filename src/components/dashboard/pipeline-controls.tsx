"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Re-fetches server data every few seconds while background jobs are running. */
export function AutoRefresh({ active, everyMs = 3000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}

export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
}: {
  action: () => Promise<unknown>;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
}) {
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant={variant} size={size} disabled={pending} onClick={() => start(async () => void (await action()))}>
      {pending ? "Working…" : children}
    </Button>
  );
}
