import { AppsEditor } from "@/components/studio/apps-editor";
import { SIGNALS, signalType } from "@/lib/app-run";
import { listApps } from "@/lib/apps";
import { enabledProducts } from "@/lib/project-reads";

/** The studio's Apps window: the project's apps, and the data products an app can read (only ones the project has switched on). */
export async function AppsManager({ projectId }: { projectId: string }) {
  const [apps, products] = await Promise.all([listApps(projectId), enabledProducts(projectId)]);
  const items = products.map((p) => {
    const type = signalType(p.observationTypes);
    return { id: p.id, name: p.name, kind: p.kind, observationTypes: p.observationTypes, available: true, dial: type ? SIGNALS[type].dial : { label: "", unit: "", value: 0 } };
  });
  return <AppsEditor projectId={projectId} apps={apps} products={items} />;
}
