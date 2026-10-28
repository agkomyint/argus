import { loadTraces } from "@/lib/traces";
import { Observatory } from "./observatory";

/** Server side of the Observatory window: reads this project's traces. */
export async function ObservatoryWindow({ projectId }: { projectId: string }) {
  const steps = await loadTraces(projectId).catch((e) => {
    console.error("observatory load failed", e);
    return null;
  });
  return steps ? <Observatory steps={steps} /> : <Observatory steps={[]} error="the trace log is not available right now" />;
}
