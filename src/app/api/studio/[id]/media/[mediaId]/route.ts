import { projectMediaKey } from "@/lib/explore";
import { presignDownload } from "@/lib/s3";
import { getAccount } from "@/lib/session";

const UUID = /^[0-9a-f-]{36}$/i;

// One photo, video or kept frame of a project, for its owner in the studio.
export async function GET(_request: Request, ctx: RouteContext<"/api/studio/[id]/media/[mediaId]">) {
  const [{ id, mediaId }, account] = await Promise.all([ctx.params, getAccount()]);
  if (!account?.projects.some((p) => p.id === id)) return Response.json({ error: "Not found" }, { status: 404 });
  const key = UUID.test(mediaId) ? await projectMediaKey(id, mediaId) : null;
  if (!key) return Response.json({ error: "Not found" }, { status: 404 });
  // The link lives 10 minutes; the browser reuses the redirect for 5, so refreshes and scrubbing don't sign in again per image.
  return new Response(null, { status: 302, headers: { location: presignDownload(key, 600), "cache-control": "private, max-age=300" } });
}
