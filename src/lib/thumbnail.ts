import "server-only";
import { cacheLife } from "next/cache";
import { s3 } from "@/lib/s3";

/** The widths a poster can be asked for. A fixed few, so each picture is resized and cached at most twice. */
export const THUMB_WIDTHS = [480, 960] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

export const isThumbWidth = (w: number): w is ThumbWidth => (THUMB_WIDTHS as readonly number[]).includes(w);

/**
 * A stored picture shrunk to `width` as WebP, or null when it is not a picture sharp can read (a video, say).
 * Who may see it is checked by the caller on every request, so the cache below never makes a private picture public.
 */
export async function thumbnail(key: string, width: ThumbWidth): Promise<Uint8Array | null> {
  try {
    return await resized(key, width);
  } catch {
    return null;
  }
}

// A storage key never changes what it holds, so a resize is kept for days. A failure throws, and is not kept.
async function resized(key: string, width: ThumbWidth) {
  "use cache";
  cacheLife("days");
  const source = await s3.file(key).arrayBuffer();
  // Loaded here rather than at the top, so a native module that fails to load costs the small copy, not the picture.
  const { default: sharp } = await import(/* turbopackIgnore: true */ "sharp");
  const out = await sharp(new Uint8Array(source)).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  return new Uint8Array(out);
}
