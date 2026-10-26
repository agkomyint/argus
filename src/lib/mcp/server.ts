import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as ops from "@/lib/ops";

const INSTRUCTIONS = `ARGUS turns raw data sources into data products (small datasets plus a widget).
Set up a project in this order:
1. list_products: pick the data products the person wants (ids).
2. create_project with a name and those product ids.
3. add_source for what the products need (each product lists "needs"). A files source takes lanes: one lane per thing the files show.
4. set_tune: level Lean to Maximum (cheaper is less accurate) and how often live sources are looked at.
5. get_project to watch sources, agents and products run; get_dataset to read the rows.
Every call acts as the signed-in person, on their own projects only.`;

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Run one op and turn its result, or an OpsError, into an MCP tool result. */
async function run(fn: () => unknown): Promise<Result> {
  try {
    const data = (await fn()) ?? { ok: true };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    if (e instanceof ops.OpsError) return { content: [{ type: "text", text: e.message }], isError: true };
    throw e;
  }
}

const projectId = z.string().describe("Project id from list_projects or create_project");
const sourceKey = z.string().describe("Source key from get_project, e.g. tl:<id>, src:<id> or screen");
const config = {
  name: z.string().optional().describe("Display name"),
  lat: z.number().optional().describe("Weather: latitude"),
  lng: z.number().optional().describe("Weather: longitude"),
  asset: z.string().optional().describe("Sensor: the asset it watches"),
  surge: z.boolean().optional().describe("Sensor: simulate a surge"),
};
const readOnly = { readOnlyHint: true };

/** The ARGUS MCP server for one person. Write tools are only there when the grant includes argus:write. */
export function argusMcpServer(userId: string, { write }: { write: boolean }) {
  const server = new McpServer({ name: "argus", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  server.registerTool("list_products", { description: "The data products ARGUS can make, with the sources each one needs.", annotations: readOnly }, () =>
    run(() => ops.listProducts()),
  );
  server.registerTool("list_projects", { description: "The person's projects.", annotations: readOnly }, () =>
    run(async () => (await ops.listProjects(userId)).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt }))),
  );
  server.registerTool(
    "get_project",
    { description: "One project: products, sources with state and progress, agents at work, tune and cost.", inputSchema: z.object({ projectId }), annotations: readOnly },
    ({ projectId }) => run(() => ops.getProject(userId, projectId)),
  );
  server.registerTool(
    "get_dataset",
    {
      description: "Rows a data product has produced, newest first.",
      inputSchema: z.object({
        projectId,
        productId: z.string(),
        type: z.string().optional().describe("Dataset type; defaults to the product's first"),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
      annotations: readOnly,
    },
    ({ projectId, productId, type, limit }) => run(() => ops.getDataset(userId, projectId, productId, type, limit)),
  );

  if (!write) return server;

  server.registerTool(
    "create_project",
    { description: "Make a project with a name and the data products it should produce.", inputSchema: z.object({ name: z.string(), productIds: z.array(z.string()).min(1) }) },
    ({ name, productIds }) =>
      run(async () => {
        const p = await ops.createProject(userId, name, productIds);
        return { id: p.id, name: p.name, next: "Add the sources the products need with add_source." };
      }),
  );
  server.registerTool(
    "set_products",
    { description: "Switch data products on or off in a project.", inputSchema: z.object({ projectId, add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() }) },
    ({ projectId, add, remove }) => run(() => ops.setProducts(userId, projectId, { add, remove })),
  );
  server.registerTool(
    "add_source",
    {
      description:
        "Add a source. files: a timeline with lanes to upload into. weather: give lat and lng. sensor_sim: give asset. webhook: returns an ingest path and key. screen: capture starts from the browser.",
      inputSchema: z.object({
        projectId,
        kind: z.enum(ops.SOURCE_KINDS),
        ...config,
        lanes: z.array(z.object({ name: z.string(), note: z.string().optional() })).optional().describe("Files: one lane per thing the files show"),
      }),
    },
    ({ projectId, kind, ...cfg }) => run(() => ops.addSource(userId, projectId, kind, cfg)),
  );
  server.registerTool(
    "configure_source",
    { description: "Change a weather or sensor source's settings and poll it.", inputSchema: z.object({ projectId, sourceId: z.string().describe("The id from add_source"), ...config }) },
    ({ projectId, sourceId, ...cfg }) => run(() => ops.configureSource(userId, projectId, sourceId, cfg)),
  );
  server.registerTool(
    "set_tune",
    {
      description: `How careful the agents are and how often live sources are looked at. Cheaper is less accurate and less often. Levels: ${ops.LEVEL_NAMES.join(", ")}. Seconds: ${ops.FREQUENCY_SECONDS.join(", ")}.`,
      inputSchema: z.object({ projectId, level: z.string().optional(), seconds: z.number().int().optional() }),
    },
    ({ projectId, level, seconds }) => run(() => ops.setTune(userId, projectId, { level, seconds })),
  );
  server.registerTool("pause_source", { description: "Hold a source's queued work. Running work finishes.", inputSchema: z.object({ projectId, key: sourceKey }) }, ({ projectId, key }) =>
    run(() => ops.setSourcePaused(userId, projectId, key, true)),
  );
  server.registerTool("resume_source", { description: "Release a paused source.", inputSchema: z.object({ projectId, key: sourceKey }) }, ({ projectId, key }) =>
    run(() => ops.setSourcePaused(userId, projectId, key, false)),
  );
  server.registerTool("retry_source", { description: "Queue a source's failed work again.", inputSchema: z.object({ projectId, key: sourceKey }) }, ({ projectId, key }) =>
    run(async () => ({ requeued: await ops.retrySource(userId, projectId, key) })),
  );
  return server;
}
