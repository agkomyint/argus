"use client";

import { useState } from "react";
import { DeliveryPanel } from "@/components/studio/delivery-panel";
import type { AppAlert } from "@/lib/app-run";

/** Variants of the real Delivery panel for /design APP-05: the playhead moves, alerts before it are lit and ones after it wait. */

const T0 = Date.UTC(2026, 10, 1, 14, 0, 0);
const alert = (i: number, min: number, label: string, why: string, severity: AppAlert["severity"] = "high"): AppAlert => ({
  id: `a:${i}`, rowId: `r${i}`, frameMs: i * 4000, appId: "a", appName: "Crowd watch", productId: "people-count", productName: "People count", at: T0 + min * 60_000, severity, label, why,
});
const ALERTS = [
  alert(1, 1, "5 people", "5 people in one frame, more than 3"),
  alert(2, 7, "4 people", "4 people in one frame, more than 3", "medium"),
  alert(3, 12, "6 people", "6 people in one frame, more than 3"),
];
const title = "mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

function Live({ at, wants = true, none }: { at: number; wants?: boolean; none?: boolean }) {
  const [tq, setTq] = useState(T0 + at * 60_000);
  return (
    <div className="grid max-w-md gap-2 border bg-card">
      <DeliveryPanel alerts={none ? [] : ALERTS} tq={tq} start={T0} onShow={(a) => setTq(a.at)} wantsBrowser={wants} />
    </div>
  );
}

export function DeliveryStates() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <div><p className={title}>Two alerts passed, one waiting (click one to jump there)</p><Live at={8} /></div>
      <div><p className={title}>Before the first alert</p><Live at={0} /></div>
      <div><p className={title}>No apps or no alerts</p><Live at={0} none /></div>
    </div>
  );
}
