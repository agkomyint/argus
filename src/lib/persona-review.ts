import "server-only";
import { generateText, Output } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projectProducts, uploads } from "@/db/schema";
import { personaAgreement } from "@/lib/fusion";
import { chatModel } from "@/lib/meta";
import { recordObservation } from "@/lib/observations";
import { clamp01 } from "@/lib/persona-math";
import { PERSONA_PRODUCTS, PERSONAS, type Persona } from "@/lib/personas";
import { s3 } from "@/lib/s3";
import { extensionOf } from "@/lib/uploads";
import { MODEL_ID, traced } from "@/lib/trace";

const point = { x: z.number().describe("0 = left edge, 1 = right edge"), y: z.number().describe("0 = top edge, 1 = bottom edge") };

const viewSchema = z.object({
  page: z.string().describe("Short name for this screen, e.g. 'Portal home', 'Article', 'Sign up'"),
  purpose: z.string().describe("One sentence: what you think this page is for"),
  clarity: z.number().int().min(1).max(10).describe("How clear the page is to you, 1 = lost, 10 = obvious"),
  continue: z.boolean().describe("Would you keep going on this site from here?"),
  quote: z.string().describe("What you would say out loud, first person, under 20 words"),
  attention: z
    .array(z.object({ label: z.string().describe("What you looked at, 2-4 words"), ...point, weight: z.number().min(0).max(1).describe("How strongly it pulled you") }))
    .max(6)
    .describe("Where your eyes went, in the order you looked"),
  friction: z
    .array(z.object({ label: z.string().describe("The element, 2-4 words"), ...point, severity: z.enum(["low", "medium", "high"]), issue: z.string().describe("One sentence: what got in your way") }))
    .max(4)
    .describe("Things that confused, slowed or put you off. Empty if nothing did"),
});

export type PersonaView = z.infer<typeof viewSchema>;

/** Is any persona product on for this project? The panel only runs when someone asked for its output. */
export async function personaPanelOn(projectId: string) {
  const rows = await db.select({ id: projectProducts.productId }).from(projectProducts).where(and(eq(projectProducts.projectId, projectId), inArray(projectProducts.productId, [...PERSONA_PRODUCTS])));
  return rows.length > 0;
}

/** One simulated visitor looks at one screenshot. The model only proposes; positions are clamped by code. */
async function lookAs(persona: Persona, bytes: Uint8Array, mediaType: string, screen: string): Promise<PersonaView> {
  const step = { kind: "model" as const, name: `persona.${persona.id}`, model: MODEL_ID(), input: { persona: persona.name, screen, image: bytes } };
  const { output } = await traced({ ...step, output: (r) => r.output, usage: (r) => r.usage }, () => generateText({
    model: chatModel(),
    output: Output.object({ schema: viewSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Role-play one website visitor looking at this screenshot for the first time. ${persona.brief}\nReport honestly from that point of view: where your eyes go first, what the page seems to be for, and anything that gets in your way. Give positions as fractions of the screenshot's width and height. Only point at things that are really visible.`,
          },
          { type: "image", image: bytes, mediaType },
        ],
      },
    ],
  }));
  return {
    ...output,
    attention: output.attention.map((a) => ({ ...a, x: clamp01(a.x), y: clamp01(a.y), weight: clamp01(a.weight) })),
    friction: output.friction.map((f) => ({ ...f, x: clamp01(f.x), y: clamp01(f.y) })),
  };
}

/**
 * The persona panel: every persona looks at one screenshot side by side, their views become Observations,
 * and the fusion step measures how much they agreed. A persona that fails is recorded and skipped.
 */
export async function reviewScreen(uploadId: string) {
  const [up] = await db.select().from(uploads).where(eq(uploads.id, uploadId));
  if (!up || up.status !== "ready") throw new Error("Upload not found or not complete");
  const ext = extensionOf(up.filename);
  const mediaType = up.contentType || `image/${ext === "jpg" ? "jpeg" : ext}`;
  const bytes = new Uint8Array(await s3.file(up.key).arrayBuffer());
  const screen = up.filename.replace(/\.[^.]+$/, "");

  const settled = await Promise.allSettled(PERSONAS.map((p) => lookAs(p, bytes, mediaType, screen)));
  const views = PERSONAS.flatMap((p, i) => (settled[i].status === "fulfilled" ? [{ persona: p, view: (settled[i] as PromiseFulfilledResult<PersonaView>).value }] : []));
  if (!views.length) throw new Error("No persona could review this screen");

  const ids = await traced({ kind: "code", name: "persona.record", input: { screen, personas: views.map((v) => v.persona.id) }, observations: (r: string[]) => r }, async () => {
    const out: string[] = [];
    const base = { file: up.filename, upload_id: up.id, screen };
    for (const { persona, view } of views) {
      const provenance = { connector: "persona-panel", producer: MODEL_ID(), estimate: true, persona: persona.id };
      const row = await recordObservation({
        projectId: up.projectId,
        uploadId: up.id,
        type: "persona_view",
        eventTime: up.createdAt,
        payload: { ...base, persona: persona.id, persona_name: persona.name, page: view.page, purpose: view.purpose, clarity: view.clarity, continue: view.continue, quote: view.quote, attention: view.attention },
        provenance,
      });
      out.push(row.id);
      for (const f of view.friction) {
        const fr = await recordObservation({
          projectId: up.projectId,
          uploadId: up.id,
          type: "persona_friction",
          eventTime: up.createdAt,
          payload: { ...base, persona: persona.id, persona_name: persona.name, page: view.page, label: f.label, issue: f.issue, severity: f.severity, x: f.x, y: f.y },
          provenance,
        });
        out.push(fr.id);
      }
    }
    return out;
  });

  const agreement = await personaAgreement(up.projectId, up.id, up.createdAt, screen, up.filename, views.map(({ persona, view }) => ({ persona: persona.id, clarity: view.clarity, continue: view.continue, points: view.attention })));
  return { personas: views.length, failed: PERSONAS.length - views.length, observations: ids.length + (agreement ? 1 : 0), agreement: agreement?.agreement ?? null };
}
