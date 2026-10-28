/**
 * The persona panel: simulated visitors, each with one point of view. DB-free so the widgets can show
 * the same names and colours the agents were given.
 */
export type Persona = { id: string; name: string; brief: string };

export const PERSONAS: readonly Persona[] = [
  { id: "newcomer", name: "First-time visitor", brief: "You have never seen this site. You want to understand what it is and what to do first." },
  { id: "hurried", name: "In a hurry", brief: "You have ten seconds and one goal: find what you came for. You skim, skip paragraphs and only notice big, obvious things." },
  { id: "low-vision", name: "Low vision", brief: "You read at 200% zoom. Small text, low contrast, thin icons and crowded links are hard for you." },
  { id: "skeptic", name: "Skeptical visitor", brief: "You distrust websites. You look for who runs this, whether it wants your money or data, and anything that feels like a trick." },
];

/** Products that read the persona panel's Observations. Enabling any one of them turns the panel on for screenshots. */
export const PERSONA_PRODUCTS = ["persona-perception-map", "persona-agreement", "friction-log"] as const;

export const personaName = (id: string) => PERSONAS.find((p) => p.id === id)?.name ?? id;
