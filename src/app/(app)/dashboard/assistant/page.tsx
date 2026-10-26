import type { Metadata } from "next";
import { Assistant } from "@/components/dashboard/assistant";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Assistant — ARGUS" };

export default async function AssistantPage() {
  const ws = (await getWorkspace())!;
  return <Assistant projectName={ws.project.name} />;
}
