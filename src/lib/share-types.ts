/** What one model found in one piece of media, as /explore shows it. */
/** Where SAM placed an object: its box and outline in the pixels of a frame `frame[0]` × `frame[1]`. */
export type SharePlace = { frame: [number, number]; box: [number, number, number, number]; outline: string | null };

export type ShareFinding = { type: string; label: string; confidence: number | null; detail?: string; place?: SharePlace };

/** A photo, video or kept screen frame on a public project. `src` is a public route that checks the owner's consent. */
export type ShareMedia = { id: string; kind: "image" | "video" | "frame"; t: number; name: string; src: string; source: string; findings: ShareFinding[] };

/** Who wrote a layer's rows: a model (with its name) or a code connector. */
export type ShareProducer = { model: string | null; connector: string | null };

/** A few real rows from a layer, so the inspector can show what came out. */
export type ShareSample = { t: number; payload: Record<string, unknown>; confidence: number | null };

/** The public extras on top of the replay. `media` is null when the owner kept media private. */
export type ShareView = {
  media: ShareMedia[] | null;
  producers: Record<string, ShareProducer>;
  samples: Record<string, ShareSample[]>;
};
