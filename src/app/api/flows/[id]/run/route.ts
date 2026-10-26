import { runFlow } from "@/app/flow-actions";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await runFlow((await params).id);
  return Response.json(r.error ? { ok: false, error: r.error } : { ok: true }, { status: r.error === "Not allowed" ? 403 : 200 });
}
