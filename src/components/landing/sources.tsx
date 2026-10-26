import { cn } from "@/lib/utils";
import { SOURCES } from "@/sources";
import { Section } from "./section-heading";

const layers = ["Connectors", "Queues", "Authentication", "Source metadata"];

export function Sources() {
  return (
    <Section
      id="sources"
      index="04"
      label="Data sources"
      title="Not just cameras."
      intro="Video is where ARGUS starts. The same ingestion layer is designed to take in every kind of source, so products can combine what a camera sees with what the rest of the world knows."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-t text-left text-sm">
          <thead className="font-mono text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-4 font-normal">Category</th>
              <th className="py-2 pr-4 font-normal">Supported inputs</th>
              <th className="py-2 pr-4 font-normal">Becomes</th>
              <th className="py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s) => (
              <tr key={s.id} className="border-b align-top">
                <td className="py-3 pr-4 font-medium">{s.name}</td>
                <td className="py-3 pr-4 text-muted-foreground">{s.inputs.join(" · ")}</td>
                <td className="py-3 pr-4 text-muted-foreground">{s.produces}</td>
                <td className="py-3 font-mono text-xs">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("size-1.5 rounded-full", s.status === "mvp" ? "bg-signal" : "bg-muted-foreground/50")} aria-hidden />
                    {s.status === "mvp" ? "First" : "Roadmap"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-16">
        <p className="mb-4 font-mono text-xs text-muted-foreground">Multimodal architecture</p>
        <div className="grid grid-cols-2 border-l border-t sm:grid-cols-3 lg:grid-cols-6 [&>*]:border-b [&>*]:border-r [&>*]:px-3 [&>*]:py-3 [&>*]:text-sm">
          {["Cameras", "Sensors", "APIs", "Databases", "Documents", "GIS"].map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <div className="mx-auto h-8 w-px bg-border" aria-hidden />
        <div className="border border-electric/60 bg-electric/[0.06] p-4">
          <p className="font-medium">Universal ingestion layer</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{layers.join(" · ")}</p>
        </div>
        <div className="mx-auto h-8 w-px bg-border" aria-hidden />
        <p className="border p-4 text-sm text-muted-foreground">
          Every source is normalized into the same observation record, carrying its origin, time and evidence. Data
          products are compiled from that one store.
        </p>
      </div>
    </Section>
  );
}
