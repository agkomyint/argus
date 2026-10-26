import "server-only";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { newIngestKey } from "@/lib/connectors";
import { enqueue } from "@/lib/jobs";
import { recordObservation, upsertAsset } from "@/lib/observations";
import { srcKey } from "@/lib/source-key";

/** A bridge with two piers, inspection history, a live weather feed and a labelled-simulated vibration sensor. */
export async function seedSample(projectId: string, opts: { withDetection?: boolean } = {}) {
  const withDetection = opts.withDetection ?? true;
  const pierA = await upsertAsset(projectId, "Pier A", { kind: "bridge pier", lat: 16.8409, lng: 96.1735, aliases: ["Bridge Pier 01", "Pier-A", "P1"] });
  await upsertAsset(projectId, "Pier B", { kind: "bridge pier", lat: 16.8412, lng: 96.1741, aliases: ["Bridge Pier 02", "Pier-B", "P2"] });

  const day = 86_400_000;
  const history = [
    { name: "Pier A", ago: 400, rating: 6, finding: "Minor surface scaling" },
    { name: "Pier A", ago: 180, rating: 4, finding: "Hairline crack on north face, monitor" },
    { name: "Pier B", ago: 180, rating: 7, finding: "No defects noted" },
  ];
  for (const h of history) {
    await recordObservation({ projectId, type: "inspection", eventTime: new Date(Date.now() - h.ago * day), assetName: h.name, payload: { rating: h.rating, finding: h.finding }, provenance: { connector: "sample-data", simulated: true } });
  }

  const [weather] = await db.insert(sources).values({ projectId, kind: "weather", name: "Weather (Open-Meteo)", config: { lat: 16.8409, lng: 96.1735 }, ingestKey: newIngestKey() }).returning();
  const [sensor] = await db.insert(sources).values({ projectId, kind: "sensor_sim", name: "Simulated vibration sensor", config: { asset: "Pier A", surge: true }, ingestKey: newIngestKey() }).returning();
  await enqueue(projectId, "poll_source", { sourceId: weather.id }, { drain: false, source: srcKey(weather.id) });
  await enqueue(projectId, "poll_source", { sourceId: sensor.id }, { drain: false, source: srcKey(sensor.id) });

  if (withDetection) {
  const detection = await recordObservation({
    projectId,
    type: "defect_detected",
    eventTime: new Date(),
    assetName: "Bridge Pier 01",
    confidence: 0.82,
    payload: { label: "crack", description: "Vertical crack along the lower pier column (sample detection)" },
    provenance: { connector: "sample-data", simulated: true, note: "Synthetic camera detection for demo; upload a real photo to run perception" },
  });
  // Investigate after the polls above, so fusion has data to join.
  await enqueue(projectId, "investigate", { observationId: detection.id });
  }
  void pierA;
}
