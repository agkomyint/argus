import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * How an extension and a consumer app fit together, for /design APP-03. A consumer app is the set of
 * extensions a project has switched on. Each extension is one manifest that says what it reads, what it
 * writes, how its result looks on the timeline, and what opens when it is clicked. Static: a reference, not a tool.
 */

const label = "font-mono text-[10px] uppercase tracking-wider text-muted-foreground";

type Step = { name: string; who: "model" | "code" | "person"; text: string };

const FLOW: Step[] = [
  { name: "Lane", who: "person", text: "Footage is uploaded into a lane" },
  { name: "Source", who: "model", text: "Muse Spark names things, SAM follows them" },
  { name: "Observations", who: "code", text: "object_track, scene_cut, people_count" },
  { name: "Data product", who: "code", text: "A manifest reads them and shows a widget" },
  { name: "Extension", who: "code", text: "Reads products, applies its rule, writes its own Observations" },
  { name: "Timeline", who: "code", text: "Draws a lane of markers or spans" },
  { name: "Panel", who: "code", text: "Opens on click with why it fired" },
];

const WHO = { model: "border-electric text-electric", code: "text-muted-foreground", person: "border-foreground" } as const;

const MANIFEST = `export const actorScenes = defineExtension({
  id: "actor-scenes",
  name: "Actor scenes",
  reads: ["object_track", "scene_cut"],      // Observation types it consumes
  writes: ["actor_present"],                 // Observation types it creates
  settings: [{ id: "minScreenTime", label: "Count as on screen after", unit: "s", value: 3 }],
  timeline: { lane: "Actors", shape: "span", label: "name or Person N" },
  panel: "actor-scene-panel",                // opens on click
  run: "src/lib/apps/actor-scenes.ts",       // plain code, no model call
});`;

const APPS = [
  { name: "Actor scenes", reads: "object_track, scene_cut", writes: "actor_present", shape: "Span per person", settings: "Counts as on screen after 3 s" },
  { name: "Lost object", reads: "object_track, people_count", writes: "lost_object", shape: "Span plus a marker", settings: "Alone for 30 s" },
  { name: "Store watch", reads: "shelf_interaction, people_count", writes: "alert", shape: "Marker", settings: "Held 20 s, cooldown 5 min" },
];

export function AppAnatomy() {
  return (
    <div className="grid gap-6">
      <div>
        <p className={cn(label, "mb-1.5")}>From footage to a highlight: who does each step</p>
        <ol className="flex flex-wrap items-stretch gap-1.5">
          {FLOW.map((s, i) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <div className={cn("grid w-36 gap-0.5 border p-2", WHO[s.who])}>
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider">{s.who === "model" ? "model proposes" : s.who === "code" ? "code computes" : "a person"}</p>
                <p className="text-xs text-muted-foreground">{s.text}</p>
              </div>
              {i < FLOW.length - 1 && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <p className={cn(label, "mb-1.5")}>One extension is one manifest</p>
          <pre className="overflow-x-auto border bg-muted/30 p-3 font-mono text-[11px] leading-5">{MANIFEST}</pre>
          <p className="mt-1.5 text-xs text-muted-foreground">The manifest is the contract: a project that lacks what it reads cannot switch the extension on, and says which lane is missing.</p>
        </div>
        <div>
          <p className={cn(label, "mb-1.5")}>A consumer app is the extensions a project switched on</p>
          <div className="overflow-x-auto border">
            <table className="w-full text-left text-xs">
              <thead className="border-b font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="p-2">Extension</th><th className="p-2">Reads</th><th className="p-2">Writes</th><th className="p-2">On the timeline</th><th className="p-2">Setting</th></tr></thead>
              <tbody>{APPS.map((a) => <tr key={a.name} className="border-b last:border-0"><td className="p-2 font-medium">{a.name}</td><td className="p-2 font-mono">{a.reads}</td><td className="p-2 font-mono">{a.writes}</td><td className="p-2">{a.shape}</td><td className="p-2 text-muted-foreground">{a.settings}</td></tr>)}</tbody>
            </table>
          </div>
          <ul className="mt-1.5 grid gap-1 text-xs text-muted-foreground">
            <li>Extensions are built in. ARGUS ships them; this is a showcase, not an install system for outside code.</li>
            <li>No extension calls a model, so a replay on /explore costs nothing.</li>
            <li>Every extension run is a traced code step and every Observation it writes points back to the tracks it used.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
