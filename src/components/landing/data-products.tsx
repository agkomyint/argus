import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Section } from "./section-heading";

const attributes = [
  ["Identity", "A product_id, version, owner, domain and description."],
  ["Contract", "Input and output schemas, units, coordinate reference and time semantics."],
  ["Evidence", "Source IDs, media references, model and transformation versions."],
  ["Quality", "Calibrated confidence, coverage, known limitations and validation status."],
  ["Operations", "Update frequency, freshness objective and failure policy."],
  ["Access", "Project authorization, privacy rules, retention and export permissions."],
];

const ladder = [
  ["L0", "Media", "Camera footage", "Unstructured source, retained under policy"],
  ["L1", "Detection", "Car bounding box", "Localized and classified observation"],
  ["L2", "Tracking", "Vehicle track", "Time-linked observations within a camera"],
  ["L3", "Event", "Vehicle crossing line", "Domain event with evidence and timestamp"],
  ["L4", "Measurement", "97 cars / 15 minutes", "Validated count with window and coverage"],
  ["L5", "Product", "Traffic flow dataset + API", "Versioned, reusable, continually maintained output"],
  ["L6", "Decision", "Investigate queue increase", "Interpretation with assumptions and human review"],
];

const spec = `product_id: vehicle-traffic-dashboard
inputs:     [object-detection-dataset]
filter:     object_class == "motorbike"
transform:  count_distinct(track_id)
group_by:   [source_id, event_time:1h]
outputs:    [parquet_dataset, timeseries_api, dashboard]
quality:    [no_duplicate_tracks, source_uptime >= 0.9]
refresh:    continuous`;

export function DataProducts() {
  return (
    <Section
      id="data-products"
      index="02"
      label="Data products"
      title="A data product is not a chart, a CSV or a model inference."
      intro="It is a reusable, documented capability with a stable identity, a contract, and lineage you can trace back to the pixels."
    >
      <dl className="border-t">
        {attributes.map(([name, text], i) => (
          <div key={name} className="grid gap-1 border-b py-4 sm:grid-cols-[3rem_10rem_1fr] sm:gap-4">
            <dt className="font-mono text-xs text-muted-foreground sm:pt-0.5">0{i + 1}</dt>
            <dd className="font-medium">{name}</dd>
            <dd className="text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-20 text-xl font-medium">From pixels to products</h3>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Each level adds meaning and responsibility. Products live at L5, and an inference is never promoted to ground
        truth on the way up.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-t text-left text-sm">
          <thead className="font-mono text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4 font-normal">Level</th>
              <th className="py-2 pr-4 font-normal">Name</th>
              <th className="py-2 pr-4 font-normal">Example</th>
              <th className="py-2 font-normal">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {ladder.map(([level, name, example, meaning], i) => {
              const product = level === "L5";
              return (
                <tr key={level} className={cn("border-b", product && "bg-signal/[0.06]")}>
                  <td className="relative py-3 pr-4 font-mono text-xs">
                    <span className="absolute inset-y-0 left-0 bg-electric/25" style={{ width: `${(i + 1) * 14}%` }} aria-hidden />
                    <span className={cn("relative pl-2", product && "text-signal")}>{level}</span>
                  </td>
                  <td className="py-3 pr-4 font-medium">{name}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{example}</td>
                  <td className="py-3 text-muted-foreground">{meaning}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-20 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex justify-between border border-b-0 px-4 py-2 font-mono text-xs text-muted-foreground">
            <span>vehicle-traffic-dashboard.yaml</span>
            <span>L5 product spec</span>
          </div>
          <pre className="overflow-x-auto border bg-obsidian p-4 font-mono text-xs leading-relaxed">{spec}</pre>
        </div>
        <div className="space-y-4 text-muted-foreground">
          <h3 className="text-xl font-medium text-foreground">Trust is part of the product.</h3>
          <p>
            Detection confidence, data coverage and domain interpretation are different properties, so ARGUS stores them
            separately. A 95% confident detector does not mean 95% complete counts.
          </p>
          <p>
            Models plan pipelines and explain evidence. Numbers come only from stored observations and deterministic,
            reproducible computation.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm">
            <Link href="/products" className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:text-electric">
              Browse the catalog <ArrowUpRight className="size-3.5" />
            </Link>
            <Link
              href="/ARGUS_Visual_Data_Products_Whitepaper_v0.1.pdf"
              target="_blank"
              className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:text-electric"
            >
              Read the whitepaper <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
