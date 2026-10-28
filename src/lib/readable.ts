/** One Observation row put into plain words for the inspector: a headline, the model's own sentence, and where it came from. */
export type Readable = { title: string; text: string | null; where: string | null; facts: [string, string][] };

// Plumbing that means nothing to a person reading the row; still visible under "raw record".
const HIDDEN = new Set(["upload_id", "at_ms", "file", "lane", "session", "at", "frame", "id", "key", "source", "track_id", "description", "summary", "text", "note", "label", "object_class", "count", "name", "value"]);
const NOUN: Record<string, [string, string]> = { people_count: ["person", "people"] };

const words = (s: string) => s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const short = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toFixed(2)) : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));

export function readable(type: string, p: Record<string, unknown>): Readable {
  const str = (k: string) => (typeof p[k] === "string" && p[k] ? (p[k] as string) : null);
  let title: string;
  if (typeof p.count === "number") {
    const [one, many] = NOUN[type] ?? ["item", "items"];
    title = `${p.count} ${p.count === 1 ? one : many}`;
  } else {
    const name = str("label") ?? str("object_class") ?? str("name") ?? (p.value != null ? short(p.value) : null);
    title = name ? words(name) : str("at") ? `${words(type)} at ${str("at")}` : words(type);
  }
  const at = str("at");
  const file = str("file");
  const where = at && file ? `${at} in ${file}` : (file ?? (at ? `at ${at}` : null));
  const facts = Object.entries(p)
    .filter(([k, v]) => !HIDDEN.has(k) && v != null && (typeof v !== "object"))
    .slice(0, 4)
    .map(([k, v]) => [words(k), short(v)] as [string, string]);
  return { title, text: str("description") ?? str("summary") ?? str("text") ?? str("note"), where, facts };
}
