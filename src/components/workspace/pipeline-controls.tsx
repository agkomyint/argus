"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";

// Shared by every mounted AutoRefresh, so a page with several of them refreshes once per interval, not once each.
let lastRefresh = 0;

/** Re-fetches server data every few seconds while background jobs are running, and not while the tab is hidden. */
export function AutoRefresh({ active, everyMs = 3000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.hidden || Date.now() - lastRefresh < everyMs * 0.8) return;
      lastRefresh = Date.now();
      router.refresh();
    };
    const t = setInterval(tick, everyMs);
    // Catch up as soon as the tab comes back instead of waiting a full interval.
    const onShow = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
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
