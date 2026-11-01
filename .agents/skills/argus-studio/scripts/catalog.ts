/** Read code contracts without importing db/ops, opening a browser, or invoking a model. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
let root = process.cwd();
let productId: string | undefined;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    console.log("Usage: bun run <skill>/scripts/catalog.ts [--root <argus-repo>] [--product <id>]");
    process.exit(0);
  }
  if (arg !== "--root" && arg !== "--product") fail(`Unknown argument: ${arg}. Use --help.`);
  const value = args[++i];
  if (!value || value.startsWith("--")) fail(`Missing value for ${arg}.`);
  if (arg === "--root") root = resolve(value);
  else productId = value;
}

const required = ["src/products/index.ts", "src/lib/setup-rules.ts", "src/lib/lane-kinds.ts", "src/widgets/resolve.ts"];
if (!required.every((file) => existsSync(resolve(root, file)))) {
  fail("ARGUS source files not found. Run from the repository root or pass --root <argus-repo>.");
}

const load = (file: string) => import(pathToFileURL(resolve(root, file)).href);
const [catalog, rules, kinds, widgets] = await Promise.all(required.map(load));
const selected = catalog.products.filter((p: { id: string; status: string }) =>
  p.status === "supported" && (!productId || p.id === productId));
if (productId && !selected.length) fail(`No supported product named ${productId}. Run without --product for available ids.`);

const products = selected.map((p: {
  id: string; name: string; summary: string; status: string; inputs: string[];
  observationTypes: string[]; kind: string; limitations: string[]; privacy: string;
}) => {
  const analyzer = rules.analyzerFor(p.id) as string | null;
  const compatibleInputs = kinds.LANE_INPUTS.filter((input: string) => {
    if (input === "camera" && analyzer !== "objects") return false;
    return rules.laneFeeds({ input, analyzer: analyzer ?? "objects" }, p.id);
  });
  return {
    id: p.id, name: p.name, summary: p.summary, status: p.status,
    observationTypes: p.observationTypes, upstream: p.inputs, analyzer,
    compatibleInputs, widget: widgets.widgetFor(p), privacy: p.privacy,
    limitations: p.limitations,
  };
});

console.log(JSON.stringify({
  mode: "read-only-code-catalog",
  note: "Compatibility reflects current setup rules, not proof of a producer or complete advertised metric. No project state was read.",
  inputs: kinds.LANE_INPUTS.map((id: string) => ({ id, ...rules.INPUT_LABEL[id] })),
  analyzers: kinds.LANE_ANALYZERS.map((id: string) => ({ id, ...rules.ANALYZER_LABEL[id], writes: rules.WRITES[id] })),
  products,
}, null, 2));
