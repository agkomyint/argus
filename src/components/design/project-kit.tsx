import { Plus } from "lucide-react";
import type { Slide as DeckSlide } from "@/components/workspace/project-deck";
import { getProduct, products } from "@/products";
import { cn } from "@/lib/utils";

/** Sample slides for PRJ-01. No rows: with showSample each product draws its labelled sample, without it the empty state. */
const deckProduct = (id: string) => ({ id, name: getProduct(id)?.name ?? id, kind: getProduct(id)?.kind ?? "dataset", rows: 0, data: [] });
export const DECK: DeckSlide[] = [
  {
    id: "deck-a", name: "Harbor Bridge monitoring", description: "Crowding on the pedestrian deck and damage on the piers, checked against the weather.", kind: "Infrastructure", shareSlug: null,
    products: ["people-count", "density-heatmap", "object-detection-dataset", "road-safety-event-feed"].map(deckProduct), more: 0,
    sources: [{ key: "a", name: "Screen share", state: "working", done: 42, total: 60, unit: "frames" }, { key: "b", name: "Weather feed", state: "done", done: 0, total: 0, unit: "" }],
    level: "Balanced", cost: "$32/h",
  },
  {
    id: "deck-b", name: "Bus stop study", description: "", kind: "Transportation", shareSlug: null,
    products: ["vehicle-traffic-dashboard", "people-count"].map(deckProduct), more: 0, sources: [], level: "Balanced", cost: "$32/h",
  },
  { id: "deck-c", name: "Body log", description: "Mood, workouts and food, one folder each.", kind: "Other", shareSlug: null, products: [], more: 0, sources: [], level: "Balanced", cost: "$32/h" },
  {
    id: "deck-d", name: "City sensors", description: "Every product the platform has, to check the panels scale.", kind: "Other", shareSlug: null,
    products: products.filter((p) => p.status === "supported" && p.widget).slice(0, 9).map((p) => deckProduct(p.id)), more: 3,
    sources: [{ key: "a", name: "Street camera", state: "done", done: 60, total: 60, unit: "frames" }, { key: "b", name: "Weather feed", state: "waiting", done: 0, total: 0, unit: "" }, { key: "c", name: "Traffic CSV", state: "error", done: 3, total: 9, unit: "files" }, { key: "d", name: "Noise meter", state: "paused", done: 0, total: 0, unit: "" }],
    level: "Balanced", cost: "$32/h",
  },
];

/** The last slide: the only place a new project begins. */
export function NewProjectSlide({ className }: { className?: string }) {
  return (
    <div className={cn("grid min-h-64 place-items-center border border-dashed p-6 text-center", className)}>
      <div><span className="mx-auto grid size-10 place-items-center border"><Plus className="size-5" /></span><p className="mt-3 font-medium">New project</p><p className="mt-1 text-sm text-muted-foreground">Say what you want to track. ARGUS plans the rest.</p></div>
    </div>
  );
}

/** The two-step start: name, then products. Sources are not asked for here. */
