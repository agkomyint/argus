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

/** What kind of footage a shot is, as a closed list so the product can count and colour by it. */
export const FOOTAGE_KINDS = ["vehicle-camera", "aerial", "in-vehicle", "still-photo", "podium", "reporter", "indoor-footage", "outdoor-footage", "graphic", "other"] as const;
export type FootageKind = (typeof FOOTAGE_KINDS)[number];

const footageSchema = z.object({
  footage: z.enum(FOOTAGE_KINDS).describe("vehicle-camera: forward view from a moving vehicle. aerial: from a helicopter, drone or tall structure. in-vehicle: a camera inside a cab. still-photo: a photograph or portrait, not moving video. podium: a speaker at a lectern. reporter: a person speaking to camera outdoors. indoor-footage / outdoor-footage: other video. graphic: a title card, map or text."),
  description: z.string().describe("One sentence on what is shown. Do not name or identify any person."),
  confidence: z.number().min(0).max(1),
});

export type FootageLabel = z.infer<typeof footageSchema>;

/**
 * Footage-label agent: ask the vision model what kind of shot one frame is. The model proposes a label from a closed
 * list and a one-line description; where the shot starts and ends was already decided by code from pixels.
 */
export async function labelFootage(bytes: Uint8Array, context: string): Promise<FootageLabel> {
  const step = { kind: "model" as const, name: "perception.footage", model: MODEL_ID(), input: { context, image: bytes } };
  const { output } = await traced({ ...step, output: (r) => r.output, usage: (r) => r.usage }, () => generateText({
    model: chatModel(),
    output: Output.object({ schema: footageSchema }),
    messages: [{ role: "user", content: [{ type: "text", text: `${context}\nThis is the middle frame of one shot of a video. Say what kind of footage the shot is. Describe the scene, never a person's identity.` }, { type: "image", image: bytes, mediaType: "image/jpeg" }] }],
  }));
  return output;
}

/** What a frame shows beyond objects: printed words and who is responding. Words are read, never guessed. */
const frameReadSchema = z.object({
  text: z.array(z.object({
    text: z.string().describe("Exactly the characters printed on screen: a caption, date stamp, speed, plate-free sign or graphic. Do not guess unreadable text."),
    where: z.enum(["caption", "stamp", "sign", "graphic", "other"]),
  })).max(6),
  responders: z.object({
    vehicles: z.number().int().min(0).max(30).describe("Emergency vehicles visible: police, fire, ambulance."),
    people: z.number().int().min(0).max(40).describe("People who look like uniformed responders."),
  }),
  confidence: z.number().min(0).max(1),
});

export type FrameRead = z.infer<typeof frameReadSchema>;

export async function readFrameDetails(bytes: Uint8Array, context: string): Promise<FrameRead> {
  const step = { kind: "model" as const, name: "perception.frame_details", model: MODEL_ID(), input: { context, image: bytes } };
  const { output } = await traced({ ...step, output: (r) => r.output, usage: (r) => r.usage }, () => generateText({
    model: chatModel(),
    output: Output.object({ schema: frameReadSchema }),
    messages: [{ role: "user", content: [{ type: "text", text: `${context}\nRead any words printed on this frame and count emergency vehicles and uniformed responders. Never name or identify a person.` }, { type: "image", image: bytes, mediaType: "image/jpeg" }] }],
  }));
  return output;
}

export const INCIDENT_KINDS = ["impact", "fire", "smoke", "stopped-traffic", "responders-arrive", "lane-blocked", "debris", "other"] as const;

const incidentsSchema = z.object({
  incidents: z.array(z.object({
    frame: z.number().int().describe("The number printed on the frame where it is first visible"),
    kind: z.enum(INCIDENT_KINDS),
    description: z.string().describe("One sentence of what is visible. Do not name or identify any person."),
    confidence: z.number().min(0).max(1),
  })).max(12),
});

export type IncidentProposal = z.infer<typeof incidentsSchema>["incidents"][number];

/** Show the model a numbered run of frames and ask where road incidents first appear. It names frame numbers; code turns them into times. */
export async function proposeIncidents(frames: { n: number; bytes: Uint8Array }[], context: string): Promise<IncidentProposal[]> {
  const step = { kind: "model" as const, name: "perception.incidents", model: MODEL_ID(), input: { context, frames: frames.map((f) => ({ n: f.n, image: f.bytes })) } };
  const { output } = await traced({ ...step, output: (r) => r.output.incidents, usage: (r) => r.usage }, () => generateText({
    model: chatModel(),
    output: Output.object({ schema: incidentsSchema }),
    messages: [{ role: "user", content: [
      { type: "text", text: `${context}\nThese are frames of one video in time order, numbered. List road incidents (impact, fire, smoke, stopped traffic, responders arriving, blocked lanes, debris) and the number of the first frame where each is visible. Only list what you can see.` },
      ...frames.flatMap((f) => [{ type: "text" as const, text: `Frame ${f.n}:` }, { type: "image" as const, image: f.bytes, mediaType: "image/jpeg" as const }]),
    ] }],
  }));
  return output.incidents;
}
