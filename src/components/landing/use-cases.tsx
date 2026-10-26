import Link from "next/link";
import { Section } from "./section-heading";

const cases = [
  { name: "Roads", text: "Traffic counts, incident detection, congestion and lane-level flow.", products: ["vehicle-traffic-dashboard", "road-safety-event-feed"] },
  { name: "Bridges", text: "Structural change tracking, load monitoring and inspection imagery.", products: ["structural-defect-map", "change-detection-dataset"] },
  { name: "Construction", text: "Progress mapping, PPE compliance and equipment activity.", products: ["bridge-construction-tracker", "machinery-utilization-dashboard"] },
  { name: "Retail", text: "Footfall, dwell time, queue length and shelf availability.", products: ["retail-footfall-analytics", "queue-analytics"] },
  { name: "Factories", text: "Line throughput, defect spotting and safe-zone enforcement.", products: ["facility-utilization-report", "anomaly-detection-feed"] },
  { name: "Logistics", text: "Yard occupancy, dock turnaround and fleet movement.", products: ["logistics-activity-dashboard", "movement-trajectory-map"] },
];

export function UseCases() {
  return (
    <Section
      id="environments"
      index="05"
      label="Environments"
      title="Intelligence for every environment."
      intro="The same agents and pipeline adapt to wherever a camera can see. Each environment draws on products from the catalog."
    >
      <ul className="border-t">
        {cases.map((c) => (
          <li key={c.name} className="grid gap-2 border-b py-5 transition-colors hover:bg-accent/30 md:grid-cols-[10rem_1fr_18rem] md:gap-6 md:px-2">
            <h3 className="text-lg font-medium">{c.name}</h3>
            <p className="text-muted-foreground">{c.text}</p>
            <p className="flex flex-col gap-0.5 font-mono text-xs">
              {c.products.map((p) => (
                <Link key={p} href={`/products/${p}`} className="text-electric hover:underline">
                  {p}
                </Link>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
