import type { ProductCategory, ProductKind, ProductLevel, ProductManifestInput, ProductStatus } from "../schema";

/**
 * Planned and research products are lightweight stubs: enough to classify them and show the
 * roadmap honestly. To promote one, write a full manifest in `supported.ts` and remove its row here.
 */
type Row = {
  no: number;
  id: string;
  name: string;
  summary: string;
  category: ProductCategory;
  kind: ProductKind;
  level: ProductLevel;
  status: Exclude<ProductStatus, "supported">;
  inputs?: string[];
  review?: boolean;
  note?: string;
};

const D = "object-detection-dataset";

const rows: Row[] = [
  // Core visual intelligence
  { no: 2, id: "geospatial-intelligence-map", name: "Geospatial intelligence map", summary: "Detected objects and events mapped to real locations.", category: "core", kind: "spatial-layer", level: "L5", status: "planned", inputs: [D] },
  { no: 3, id: "movement-trajectory-map", name: "Movement & trajectory map", summary: "Movement patterns over time.", category: "core", kind: "spatial-layer", level: "L4", status: "planned", inputs: [D] },
  { no: 5, id: "change-detection-dataset", name: "Change detection dataset", summary: "Differences between locations over time.", category: "core", kind: "dataset", level: "L3", status: "research" },
  { no: 6, id: "visual-asset-inventory", name: "Visual asset inventory", summary: "Catalog of buildings, roads, equipment and infrastructure.", category: "core", kind: "dataset", level: "L3", status: "research" },

  // Transportation intelligence
  { no: 8, id: "motorbike-intelligence-map", name: "Motorbike intelligence map", summary: "Motorbike density, movements and parking patterns.", category: "transportation", kind: "spatial-layer", level: "L5", status: "planned", inputs: [D] },
  { no: 9, id: "road-condition-dataset", name: "Road condition dataset", summary: "Potholes, cracks, damaged signs and obstructions.", category: "transportation", kind: "dataset", level: "L3", status: "research", review: true },
  { no: 10, id: "parking-occupancy-monitor", name: "Parking occupancy monitor", summary: "Parking availability and usage.", category: "transportation", kind: "timeseries", level: "L4", status: "planned", inputs: [D] },
  { no: 11, id: "intersection-analytics", name: "Intersection analytics", summary: "Traffic queues, turning movements and estimated delays.", category: "transportation", kind: "timeseries", level: "L4", status: "planned", inputs: [D] },

  // Construction & infrastructure
  { no: 13, id: "bridge-construction-tracker", name: "Bridge construction tracker", summary: "Construction stages and visible progress.", category: "construction", kind: "report", level: "L5", status: "research", review: true },
  { no: 14, id: "structural-defect-map", name: "Structural defect map", summary: "Locations of suspected surface defects for inspection.", category: "construction", kind: "spatial-layer", level: "L5", status: "research", review: true, note: "Does not prove structural capacity or hidden integrity" },
  { no: 15, id: "construction-site-digital-twin", name: "Construction site digital twin", summary: "Spatial representation linked to updated observations.", category: "construction", kind: "twin", level: "L5", status: "research" },
  { no: 16, id: "machinery-utilization-dashboard", name: "Machinery utilization dashboard", summary: "Equipment activity and idle time.", category: "construction", kind: "timeseries", level: "L4", status: "planned", inputs: [D] },
  { no: 17, id: "construction-safety-monitor", name: "Construction safety monitor", summary: "Visible hazards and safety compliance indicators.", category: "construction", kind: "alert", level: "L3", status: "planned", inputs: [D], review: true },
  { no: 18, id: "infrastructure-maintenance-register", name: "Infrastructure maintenance register", summary: "Assets requiring inspection or maintenance.", category: "construction", kind: "report", level: "L5", status: "research", review: true },

  // Business intelligence
  { no: 19, id: "retail-footfall-analytics", name: "Retail footfall analytics", summary: "Store traffic and visitor counts.", category: "business", kind: "timeseries", level: "L4", status: "planned", inputs: [D] },
  { no: 20, id: "customer-movement-heatmap", name: "Customer movement heatmap", summary: "Aggregate movement patterns inside stores.", category: "business", kind: "spatial-layer", level: "L5", status: "planned", inputs: [D] },
  { no: 21, id: "queue-analytics", name: "Queue analytics", summary: "Waiting lines and estimated congestion.", category: "business", kind: "timeseries", level: "L4", status: "planned", inputs: [D] },
  { no: 22, id: "shelf-availability-monitor", name: "Shelf availability monitor", summary: "Visible empty shelf spaces.", category: "business", kind: "alert", level: "L3", status: "research" },
  { no: 23, id: "logistics-activity-dashboard", name: "Logistics activity dashboard", summary: "Truck arrivals, loading and unloading.", category: "business", kind: "timeseries", level: "L4", status: "planned", inputs: [D] },
  { no: 24, id: "facility-utilization-report", name: "Facility utilization report", summary: "Space and equipment usage.", category: "business", kind: "report", level: "L5", status: "research" },

  // Advanced intelligence
  { no: 25, id: "real-time-event-stream", name: "Real-time event stream", summary: "Structured observations published continuously.", category: "advanced", kind: "event-stream", level: "L3", status: "planned", inputs: [D] },
  { no: 26, id: "spatiotemporal-knowledge-graph", name: "Spatiotemporal knowledge graph", summary: "Relationships between objects, places, events and time.", category: "advanced", kind: "graph", level: "L5", status: "research" },
  { no: 27, id: "anomaly-detection-feed", name: "Anomaly detection feed", summary: "Unusual changes or activity patterns.", category: "advanced", kind: "alert", level: "L4", status: "research", review: true },
  { no: 28, id: "predictive-intelligence-dashboard", name: "Predictive intelligence dashboard", summary: "Forecasts based on historical observations.", category: "advanced", kind: "forecast", level: "L6", status: "research", review: true },
  { no: 29, id: "ai-investigation-report", name: "AI investigation report", summary: "Evidence-backed interpretations and findings.", category: "advanced", kind: "report", level: "L6", status: "research", review: true },
  { no: 30, id: "intelligence-api", name: "Intelligence API", summary: "Structured intelligence accessible to other applications.", category: "advanced", kind: "api", level: "L5", status: "planned", inputs: [D] },
];

export const roadmap: ProductManifestInput[] = rows.map((r) => ({
  id: r.id,
  no: r.no,
  version: "0.1.0",
  name: r.name,
  summary: r.summary,
  category: r.category,
  owner: "argus-core",
  kind: r.kind,
  level: r.level,
  status: r.status,
  inputs: r.inputs ?? [],
  schema: [],
  evidence: "aggregate-only",
  quality: [],
  limitations: [r.note ?? "Contract not yet specified"],
  refresh: "continuous",
  outputs: [],
  privacy: "aggregate-only",
  requiresHumanReview: r.review ?? false,
}));
