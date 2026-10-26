import { convertToModelMessages, createUIMessageStreamResponse, stepCountIs, streamText, tool, toUIMessageStream, type UIMessage } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts, chats, observations, projectProducts, uploads } from "@/db/schema";
import { chatModel, META_CONFIGURED } from "@/lib/meta";
import { kindLabel } from "@/lib/projects";
import { getWorkspace } from "@/lib/session";
import { getProduct } from "@/products";

export async function POST(req: Request) {
  const ws = await getWorkspace();
  if (!ws) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!META_CONFIGURED) return Response.json({ error: "META_API_KEY is not set on the server" }, { status: 503 });

  const { messages, id }: { messages: UIMessage[]; id: string } = await req.json();
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Bad chat id" }, { status: 400 });
  const [existing] = await db.select({ userId: chats.userId }).from(chats).where(eq(chats.id, id));
  if (existing && existing.userId !== ws.user.id) return Response.json({ error: "Not found" }, { status: 404 });
  const projectId = ws.project.id;

  const result = streamText({
    model: chatModel(),
    system: [
      "You are the ARGUS assistant, helping a user manage a multimodal data-intelligence project.",
      `Active project: "${ws.project.name}" (${kindLabel(ws.project.kind)}).`,
      "Use the tools to look up the project's real files, enabled data products, observations and alerts. Never invent files, products or numbers; if the tools return nothing, say so.",
      "Be concise.",
    ].join("\n"),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      listFiles: tool({
        description: "List the files uploaded to the active project.",
        inputSchema: z.object({}),
        execute: async () => {
          const rows = await db.select().from(uploads).where(and(eq(uploads.projectId, projectId), eq(uploads.status, "ready")));
          return rows.map((r) => ({ filename: r.filename, contentType: r.contentType, sizeBytes: r.size, uploadedAt: r.createdAt.toISOString() }));
        },
      }),
      listAlerts: tool({
        description: "List the most recent alerts drafted by the agents for the active project, with severity, status, summary and verified claims.",
        inputSchema: z.object({ status: z.enum(["pending", "approved", "dismissed"]).optional() }),
        execute: async ({ status }) => {
          const rows = await db.select().from(alerts).where(status ? and(eq(alerts.projectId, projectId), eq(alerts.status, status)) : eq(alerts.projectId, projectId)).orderBy(desc(alerts.createdAt)).limit(10);
          return rows.map((a) => ({ id: a.id, title: a.title, severity: a.severity, status: a.status, summary: a.summary, createdAt: a.createdAt.toISOString() }));
        },
      }),
      listObservations: tool({
        description: "List the most recent observations (sensor readings, weather, detections, inspections) for the active project. Optionally filter by type.",
        inputSchema: z.object({ type: z.string().optional(), limit: z.number().int().min(1).max(30).default(15) }),
        execute: async ({ type, limit }) => {
          const rows = await db.select().from(observations).where(type ? and(eq(observations.projectId, projectId), eq(observations.type, type)) : eq(observations.projectId, projectId)).orderBy(desc(observations.eventTime)).limit(limit);
          return rows.map((o) => ({ id: o.id, type: o.type, eventTime: o.eventTime.toISOString(), confidence: o.confidence, payload: o.payload, simulated: Boolean((o.provenance as { simulated?: boolean }).simulated) }));
        },
      }),
      listEnabledProducts: tool({
        description: "List the data products enabled for the active project.",
        inputSchema: z.object({}),
        execute: async () => {
          const rows = await db.select().from(projectProducts).where(eq(projectProducts.projectId, projectId));
          return rows.map((r) => {
            const p = getProduct(r.productId);
            return { id: r.productId, name: p?.name ?? r.productId, summary: p?.summary };
          });
        },
      }),
    },
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: async ({ messages: all }) => {
        const first = messages.find((m) => m.role === "user")?.parts.find((p) => p.type === "text");
        const title = (first && "text" in first ? first.text : "New chat").replace(/s+/g, " ").trim().slice(0, 60) || "New chat";
        await db
          .insert(chats)
          .values({ id, projectId, userId: ws.user.id, title, messages: all })
          .onConflictDoUpdate({ target: chats.id, set: { messages: all, updatedAt: new Date() } });
      },
    }) });
}
