import { sharedMediaKey } from "@/lib/explore";
import { presignDownload } from "@/lib/s3";
import { isThumbWidth, thumbnail } from "@/lib/thumbnail";

const UUID = /^[0-9a-f-]{36}$/i;

// One photo, video or kept screen frame of a shared project. Public only while the owner shows media.
// `?w=480` or `?w=960` returns a picture shrunk for a card instead of the full file.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const key = UUID.test(id) ? await sharedMediaKey(slug, id) : null;
  if (!key) return Response.json({ error: "Not found" }, { status: 404 });
  // Reused by the browser for one minute only, so turning media off takes effect within a minute.
  const cache = "private, max-age=60";
  const w = Number(new URL(request.url).searchParams.get("w"));
  const small = isThumbWidth(w) ? await thumbnail(key, w) : null;
  if (small) return new Response(small as Uint8Array<ArrayBuffer>, { headers: { "content-type": "image/webp", "cache-control": cache } });
  return new Response(null, { status: 302, headers: { location: presignDownload(key, 600), "cache-control": cache } });
}
