import type { Metadata } from "next";
import { BridgeOverview } from "@/components/dashboard/bridge-overview";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Bridge monitor — ARGUS" };

export default async function BridgePage() {
  const ws = (await getWorkspace())!;
  return <BridgeOverview project={ws.project} />;
}
