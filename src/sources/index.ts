export type SourceStatus = "mvp" | "roadmap";

export type SourceCategory = {
  id: string;
  name: string;
  status: SourceStatus;
  inputs: string[];
  produces: string;
};

export const SOURCES: SourceCategory[] = [
  { id: "visual", name: "Visual", status: "mvp", inputs: ["CCTV", "Phone cameras", "Drones", "Images", "Videos"], produces: "Detections, tracks, events" },
  { id: "iot", name: "IoT & Sensors", status: "roadmap", inputs: ["GPS", "Temperature", "Vibration", "Air quality", "Water levels"], produces: "Time series, threshold events" },
  { id: "databases", name: "Databases", status: "roadmap", inputs: ["PostgreSQL", "MySQL", "MongoDB"], produces: "Reference tables, entity records" },
  { id: "apis", name: "External APIs", status: "roadmap", inputs: ["Weather", "Traffic", "Maps", "Financial data"], produces: "Context series for joins" },
  { id: "files", name: "Files", status: "roadmap", inputs: ["CSV", "Excel", "JSON", "Parquet", "GeoJSON"], produces: "Batch datasets" },
  { id: "documents", name: "Documents", status: "roadmap", inputs: ["PDFs", "Engineering plans", "Inspection reports"], produces: "Extracted facts with page evidence" },
  { id: "geospatial", name: "Geospatial", status: "roadmap", inputs: ["GIS", "OpenStreetMap", "Satellite imagery"], produces: "Base layers, change detection" },
  { id: "streams", name: "Event streams", status: "roadmap", inputs: ["MQTT", "Kafka", "WebSockets", "Webhooks"], produces: "Live event feeds" },
  { id: "business", name: "Business systems", status: "roadmap", inputs: ["ERP", "Inventory", "Logistics", "Maintenance systems"], produces: "Operational context" },
  { id: "reports", name: "Human reports", status: "roadmap", inputs: ["Inspection notes", "Field observations", "Complaints"], produces: "Annotated observations" },
];
