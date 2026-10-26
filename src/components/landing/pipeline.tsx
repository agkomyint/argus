import { Section } from "./section-heading";

const stages = [
  ["Ingestion queues", "Cameras, RTSP streams and datasets are buffered, ordered and replayable."],
  ["Reusable AI agents", "Compose detectors and reasoners once, deploy them across any stream."],
  ["Observation store", "Every detection is stored as a timestamped, geo-referenced observation."],
  ["Data Product Compiler", "Turn observations into versioned, queryable data products and APIs."],
];

export function Pipeline() {
  return (
    <Section
      id="pipeline"
      index="06"
      label="Architecture"
      title="Built for continuous intelligence."
      intro="Always-on infrastructure, not one-off analysis. Four layers keep the world observed and the data fresh."
    >
      <ol className="grid gap-x-8 gap-y-10 md:grid-cols-4">
        {stages.map(([title, text], i) => (
          <li key={title} className="relative border-t border-foreground/40 pt-4">
            <span className="absolute -top-[5px] left-0 size-2.5 bg-electric" aria-hidden />
            <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
            <h3 className="mt-3 text-lg font-medium leading-snug">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
