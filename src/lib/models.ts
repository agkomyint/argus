/**
 * The Meta models ARGUS can call, by what they are for rather than by name. Code asks for a capability
 * ("segment") and gets the model id to send, so a newer model is a change of env, not of code. Each model
 * here was listed by `GET /v1/models` for our key; only the ones with `used` are called today.
 */

export type Capability = "reason" | "segment" | "transcribe" | "image" | "world";

export type MetaModel = {
  capability: Capability;
  /** The id sent to the Meta API unless the env overrides it. */
  id: string;
  env: string;
  family: string;
  /** What it does for a data product, in a few words. Shown in the docs and the Observatory. */
  role: string;
  /** Called by ARGUS today. The rest are known and ready, but nothing calls them yet. */
  used: boolean;
};

export const MODELS: readonly MetaModel[] = [
  { capability: "reason", id: "muse-spark-1.3", env: "META_MODEL", family: "Muse Spark", role: "Reads pictures, frames and screens, names what is in them, and plans setup", used: true },
  { capability: "segment", id: "sam-3.1", env: "META_SAM_MODEL", family: "SAM", role: "Finds where each named object is: a box and an outline", used: true },
  { capability: "transcribe", id: "muse-voice-transcribe-1.0", env: "META_TRANSCRIBE_MODEL", family: "Muse Voice", role: "Turns speech into timed text", used: false },
  { capability: "image", id: "muse-image-1.0", env: "META_IMAGE_MODEL", family: "Muse Image", role: "Makes and edits pictures", used: false },
  { capability: "world", id: "muse-wonder-1.0", env: "META_WONDER_MODEL", family: "Muse Wonder", role: "Builds scenes and worlds", used: false },
];

/** The model id to send for a capability: the env override when set, else the default. */
export function modelFor(capability: Capability): string {
  const m = MODELS.find((x) => x.capability === capability)!;
  return process.env[m.env] || m.id;
}

/** The family a model id belongs to, for labels. Unknown ids keep their own name. */
export function familyOf(id: string | null | undefined): string | null {
  if (!id) return null;
  const m = MODELS.find((x) => x.id === id || process.env[x.env] === id || id.startsWith(x.id.replace(/-[\d.]+$/, "")));
  return m?.family ?? id;
}
