import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/meta";
import { MODEL_ID, traced } from "@/lib/trace";

const findingsSchema = z.object({
  findings: z
    .array(
      z.object({
        label: z.string().describe("Short class name, e.g. crack, spalling, corrosion, car, truck, person, none"),
        kind: z.enum(["object", "defect"]).describe("object: a thing in the scene (car, truck, bus, motorbike, person, machinery, animal). defect: damage or wear"),
        confidence: z.number().min(0).max(1),
        description: z.string().describe("One sentence: what is visible and where in the frame"),
      }),
    )
    .max(8),
});

export type Finding = z.infer<typeof findingsSchema>["findings"][number];

/**
 * Perception agent: ask the vision model what is in one frame.
 * The model proposes labels; nothing downstream treats them as measurements.
 */
export async function perceiveImage(bytes: Uint8Array, mediaType: string, context: string): Promise<Finding[]> {
  const step = { kind: "model" as const, name: "perception.image", model: MODEL_ID(), input: { context, mediaType, image: bytes } };
  const { output } = await traced({ ...step, output: (r) => r.output.findings, usage: (r) => r.usage }, () => generateText({
    model: chatModel(),
    output: Output.object({ schema: findingsSchema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are the perception stage of an infrastructure monitoring system. ${context}\nList visible defects or notable objects with a calibrated confidence. If nothing notable is visible return one finding with label "none".`,
          },
          { type: "image", image: bytes, mediaType },
        ],
      },
    ],
  }));
  return output.findings;
}

export type SceneCounts = { people: number; apparent?: { female: number; male: number; unclear: number } };

/**
 * Count people in a screen-share frame. The model only estimates; code clamps and reconciles the numbers.
 * Attribute counts are requested only when the project opted in, and are aggregate (never per person).
 */
export async function perceiveScene(bytes: Uint8Array, wantAttributes: boolean): Promise<SceneCounts> {
  const count = z.number().int().min(0).max(500);
  const schema = z.object({ people: count, female: count, male: count, unclear: count });
  const step = { kind: "model" as const, name: "perception.scene", model: MODEL_ID(), input: { wantAttributes, image: bytes } };
  const { output } = await traced({ ...step, output: (r) => r.output, usage: (r) => r.usage }, () => generateText({
    model: chatModel(),
    output: Output.object({ schema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `This is one sampled frame of a screen share. Count the real people visible in it (video call tiles, photos, video, camera feeds). Do not count drawings, icons or avatars. Do not identify anyone.${
              wantAttributes ? " Also give a rough aggregate split of those people by apparent gender presentation in female, male and unclear (use unclear when you cannot judge). The three numbers must add up to people." : " Set female, male and unclear to 0."
            } If no people are visible, return 0.`,
          },
          { type: "image", image: bytes, mediaType: "image/jpeg" },
        ],
      },
    ],
  }));
  if (!wantAttributes) return { people: output.people };
  const female = Math.min(output.female, output.people);
  const male = Math.min(output.male, output.people - female);
  return { people: output.people, apparent: { female, male, unclear: output.people - female - male } };
}
