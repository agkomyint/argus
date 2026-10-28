import { convertToModelMessages, createUIMessageStreamResponse, stepCountIs, streamText, tool, toUIMessageStream } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts, chats, observations, projectProducts, uploads } from "@/db/schema";
import { describeDataset, scopeOf, type AskMessage } from "@/lib/assistant";
import { chatModel, META_CONFIGURED } from "@/lib/meta";
import { loadProductData } from "@/lib/product-data";
import { kindLabel } from "@/lib/projects";
import { getAccount } from "@/lib/session";
import { writeTrace } from "@/lib/trace";
import { getProduct } from "@/products";

/**
 * Ask ARGUS: one chat over all of the user's projects. An @-mention on the latest message narrows it
 * to those projects. The model picks the lookups; every number comes back from code over real rows.
 */
export async function POST(req: Request) {
  const account = await getAccount();
  if (!account) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!META_CONFIGURED) return Response.json({ error: "META_API_KEY is not set on the server" }, { status: 503 });

  const { messages, id, home }: { messages: AskMessage[]; id: string; home?: string } = await req.json();
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Bad chat id" }, { status: 400 });
  const [existing] = await db.select({ userId: chats.userId }).from(chats).where(eq(chats.id, id));
  if (existing && existing.userId !== account.user.id) return Response.json({ error: "Not found" }, { status: 404 });

  const owned = account.projects.map((p) => p.id);
  const scope = scopeOf(messages, owned);
  const inScope = account.projects.filter((p) => scope.includes(p.id));
  // Observatory: every model turn and every lookup it makes is recorded, on the project when it is clear which one.
  const one = scope.length === 1 ? scope[0] : null;
  const question = messages.findLast((m) => m.role === "user")?.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ") ?? "";
  const project = z.string().refine((v) => scope.includes(v), "Not a project in scope").describe("Project id, from listProjects");

  const result = streamText({
    model: chatModel(),
    system: [
      "You are Ask ARGUS, the assistant over a user's ARGUS projects. ARGUS turns sources (video, files, sensors) into data products.",
      scope.length === owned.length
        ? "The question covers all of the user's projects."
        : `The user @-mentioned: ${inScope.map((p) => `"${p.name}"`).join(", ")}. Answer about those only.`,
      `Projects in scope: ${inScope.map((p) => `${p.name} (id ${p.id}, ${kindLabel(p.kind)})`).join("; ") || "none"}.`,
      "Always use the tools to look things up. Never invent files, products or numbers. Quote numbers exactly as the tools return them and say which project and product they came from.",
      "If a tool returns nothing, say there is no data yet and suggest setting it up in ARGUS Studio. You answer questions only; setup happens in the studio.",
      "Be brief and friendly. Use short paragraphs or bullets. Times are UTC.",
    ].join("\n"),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(6),
    onLanguageModelCallEnd: (e) => writeTrace({
      kind: "model",
      name: "ask.reply",
      model: e.modelId,
      status: "ok",
      ms: Math.round(e.performance.responseTimeMs),
      projectId: one,
      userId: account.user.id,
      input: { question, scope: inScope.map((p) => p.name) },
      output: e.content.flatMap((c): Record<string, unknown>[] => (c.type === "text" ? [{ text: c.text }] : c.type === "tool-call" ? [{ calls: c.toolName, with: c.input }] : [])),
      tokensIn: e.usage.inputTokens ?? null,
      tokensOut: e.usage.outputTokens ?? null,
    }),
    onToolExecutionEnd: (e) => {
      const input = (e.toolCall.input ?? {}) as { project?: string };
      const failed = e.toolOutput.type === "tool-error";
      return writeTrace({
        kind: "tool",
        name: `ask.${e.toolCall.toolName}`,
        status: failed ? "error" : "ok",
        ms: Math.round(e.toolExecutionMs),
        projectId: input.project && scope.includes(input.project) ? input.project : one,
        userId: account.user.id,
        input,
        output: failed ? null : e.toolOutput.output,
        error: failed ? String(e.toolOutput.error) : null,
      });
    },
    tools: {
      listProjects: tool({
        description: "List the projects in scope with their description and enabled data products.",
        inputSchema: z.object({}),
        execute: async () => {
          const enabled = inScope.length ? await db.select().from(projectProducts).where(inArray(projectProducts.projectId, scope)) : [];
          return inScope.map((p) => ({
            id: p.id,
            name: p.name,
            kind: kindLabel(p.kind),
            description: p.description || null,
            products: enabled.filter((r) => r.projectId === p.id).flatMap((r) => {
              const prod = getProduct(r.productId);
              return prod?.status === "supported" ? [{ id: prod.id, name: prod.name, summary: prod.summary }] : [];
            }),
          }));
        },
      }),
      describeProduct: tool({
        description: "Compute one data product of a project: row counts, time span, busiest hour, and min/max/mean/latest of each numeric field.",
        inputSchema: z.object({ project, product: z.string().describe("Product id, from listProjects") }),
        execute: async ({ project: pid, product }) => {
          const [on] = await db.select().from(projectProducts).where(and(eq(projectProducts.projectId, pid), eq(projectProducts.productId, product)));
          const prod = getProduct(product);
          if (!on || !prod) return { error: "That product is not set up in this project." };
          const data = await loadProductData(pid, prod, 500);
          return { product: prod.name, datasets: data.map(describeDataset) };
        },
      }),
      listObservations: tool({
        description: "List the most recent raw observations of a project, optionally of one type.",
        inputSchema: z.object({ project, type: z.string().optional(), limit: z.number().int().min(1).max(30).default(12) }),
        execute: async ({ project: pid, type, limit }) => {
          const rows = await db.select().from(observations).where(type ? and(eq(observations.projectId, pid), eq(observations.type, type)) : eq(observations.projectId, pid)).orderBy(desc(observations.eventTime)).limit(limit);
          return rows.map((o) => ({ type: o.type, eventTime: o.eventTime.toISOString(), confidence: o.confidence, payload: o.payload, simulated: Boolean((o.provenance as { simulated?: boolean }).simulated) }));
        },
      }),
      listAlerts: tool({
        description: "List the latest alerts of a project with severity, status and summary.",
        inputSchema: z.object({ project, status: z.enum(["pending", "approved", "dismissed"]).optional() }),
        execute: async ({ project: pid, status }) => {
          const rows = await db.select().from(alerts).where(status ? and(eq(alerts.projectId, pid), eq(alerts.status, status)) : eq(alerts.projectId, pid)).orderBy(desc(alerts.createdAt)).limit(10);
          return rows.map((a) => ({ title: a.title, severity: a.severity, status: a.status, summary: a.summary, createdAt: a.createdAt.toISOString() }));
        },
      }),
      listFiles: tool({
        description: "List the files uploaded to a project.",
        inputSchema: z.object({ project }),
        execute: async ({ project: pid }) => {
          const rows = await db.select().from(uploads).where(and(eq(uploads.projectId, pid), eq(uploads.status, "ready"))).orderBy(desc(uploads.createdAt)).limit(30);
          return rows.map((r) => ({ filename: r.filename, contentType: r.contentType, sizeBytes: r.size, uploadedAt: r.createdAt.toISOString() }));
        },
      }),
    },
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: async ({ messages: all }) => {
        const first = messages.find((m) => m.role === "user")?.parts.find((p) => p.type === "text");
        const title = (first && "text" in first ? first.text : "New chat").replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
        await db
          .insert(chats)
          .values({ id, projectId: home && owned.includes(home) ? home : null, userId: account.user.id, title, messages: all })
          .onConflictDoUpdate({ target: chats.id, set: { messages: all, updatedAt: new Date() } });
      },
    }) });
}
