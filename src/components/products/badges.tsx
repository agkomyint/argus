import { Activity, Boxes, Database, FileText, Map, Network, Plug, Radio, TrendingUp, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProductKind, ProductLevel, ProductStatus } from "@/products";

const STATUS_STYLE: Record<ProductStatus, string> = {
  supported: "border-signal/50 bg-signal/10 text-signal",
  planned: "border-electric/50 bg-electric/10 text-electric",
  research: "text-muted-foreground",
};

export const STATUS_META: Record<ProductStatus, { label: string; description: string }> = {
  supported: { label: "Supported", description: "Built and available in the MVP." },
  planned: { label: "Planned", description: "Direction is clear. Not built yet." },
  research: { label: "Research", description: "Open questions. May need new data or human review." },
};

export const KIND_META: Record<ProductKind, { label: string; description: string; icon: LucideIcon }> = {
  dataset: { label: "Dataset", description: "Structured records you can query or export", icon: Database },
  "event-stream": { label: "Event stream", description: "Observations published continuously", icon: Radio },
  timeseries: { label: "Timeseries", description: "Measurements over time windows", icon: Activity },
  "spatial-layer": { label: "Spatial layer", description: "A map layer on real locations", icon: Map },
  alert: { label: "Alert", description: "Events that need attention", icon: TriangleAlert },
  report: { label: "Report", description: "Findings written up with evidence", icon: FileText },
  graph: { label: "Graph", description: "Relationships between things", icon: Network },
  forecast: { label: "Forecast", description: "Predictions from history", icon: TrendingUp },
  twin: { label: "Digital twin", description: "A live model of a place", icon: Boxes },
  api: { label: "API", description: "Programmatic access for other apps", icon: Plug },
};

export const LEVEL_META: Record<ProductLevel, { label: string; description: string }> = {
  L1: { label: "Detection", description: "Localized, classified observations" },
  L2: { label: "Tracking", description: "Observations linked over time" },
  L3: { label: "Event", description: "Domain events with evidence" },
  L4: { label: "Measurement", description: "Validated counts and metrics" },
  L5: { label: "Product", description: "Versioned, maintained output" },
  L6: { label: "Decision", description: "Interpretation, human reviewed" },
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", STATUS_STYLE[status])}>
      {STATUS_META[status].label}
    </Badge>
  );
}

export function KindBadge({ kind }: { kind: ProductKind }) {
  const { label, icon: Icon } = KIND_META[kind];
  return (
    <Badge variant="outline" className="gap-1.5 text-foreground">
      <Icon className="size-3 text-electric" /> {label}
    </Badge>
  );
}

export function LevelBadge({ level }: { level: ProductLevel }) {
  return (
    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
      {level} · {LEVEL_META[level].label}
    </Badge>
  );
}

export function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
      {children}
    </Badge>
  );
}
