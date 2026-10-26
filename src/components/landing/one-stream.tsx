"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Section } from "./section-heading";

const bars = [38, 52, 71, 88, 64, 49, 77, 93, 58, 44, 61, 35];

const outputs = [
  { value: "traffic", label: "Traffic intelligence" },
  { value: "vehicles", label: "Vehicle analytics" },
  { value: "safety", label: "Safety alerts" },
  { value: "spatial", label: "Spatial datasets" },
];

export function OneStream() {
  return (
    <Section
      id="stream"
      index="03"
      label="Platform"
      title="One stream. Infinite possibilities."
      intro="A single camera feed becomes many products. Pick an output to see what ARGUS derives from the same footage."
    >
      <Tabs defaultValue="traffic" className="gap-0">
        <TabsList variant="line" className="h-auto w-full flex-wrap justify-start gap-x-6 gap-y-2 border-b pb-2">
          {outputs.map((o) => (
            <TabsTrigger key={o.value} value={o.value} className="px-0">
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid border border-t-0 lg:grid-cols-[1fr_1.4fr] lg:divide-x">
          <div className="flex min-h-72 flex-col bg-obsidian p-4">
            <div className="flex justify-between font-mono text-xs text-muted-foreground">
              <span>SOURCE · CAM-0427</span>
              <span className="text-signal">LIVE</span>
            </div>
            <div className="relative my-4 flex-1 border bg-road">
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
              <div className="absolute left-[15%] top-[28%] h-6 w-12 border border-signal" />
              <div className="absolute left-[55%] top-[58%] h-6 w-14 border border-signal" />
              <div className="absolute left-[38%] top-[40%] h-5 w-10 border border-electric" />
            </div>
            <p className="font-mono text-xs text-muted-foreground">1 stream, 4 data products</p>
          </div>

          <div className="min-h-72 p-4">
            <TabsContent value="traffic">
              <PanelTitle title="vehicle-traffic-dashboard" meta="vehicles / min, 12 intervals" />
              <div className="flex h-40 items-end gap-1.5 border-b">
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 bg-electric/80" style={{ height: `${h}%` }} />
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Flow, density and congestion per lane, updated continuously.</p>
            </TabsContent>

            <TabsContent value="vehicles">
              <PanelTitle title="object-detection-dataset" meta="last 24h, by class" />
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["Cars", 72],
                    ["Trucks", 18],
                    ["Buses", 6],
                    ["Motorcycles", 4],
                  ].map(([name, pct]) => (
                    <tr key={name} className="border-b">
                      <td className="w-28 py-3">{name}</td>
                      <td className="py-3">
                        <div className="h-1.5 bg-muted">
                          <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="w-12 py-3 text-right font-mono text-xs text-muted-foreground">{pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="safety">
              <PanelTitle title="road-safety-event-feed" meta="3 open, needs review" />
              <ul className="font-mono text-xs">
                {[
                  ["Stopped vehicle in lane 2", "12s ago", "text-destructive"],
                  ["Wrong-way movement detected", "2m ago", "text-destructive"],
                  ["Speed anomaly +34 km/h", "6m ago", "text-chart-4"],
                ].map(([msg, when, tone]) => (
                  <li key={msg} className="flex justify-between gap-4 border-b py-3">
                    <span className={tone}>{msg}</span>
                    <span className="text-muted-foreground">{when}</span>
                  </li>
                ))}
              </ul>
            </TabsContent>

            <TabsContent value="spatial">
              <PanelTitle title="density-heatmap" meta="GeoJSON, exportable" />
              <pre className="overflow-x-auto border bg-obsidian p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                {`{
  "type": "Feature",
  "geometry": { "type": "Polygon", "coordinates": [...] },
  "properties": {
    "bin_id": "b_0412",
    "density": 14,
    "coverage": 0.96,
    "window_end": "2026-10-26T09:15:00+07:00"
  }
}`}
              </pre>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </Section>
  );
}

function PanelTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-4 flex justify-between font-mono text-xs">
      <span className="text-electric">{title}</span>
      <span className="text-muted-foreground">{meta}</span>
    </div>
  );
}
