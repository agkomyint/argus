import { describe, expect, mock, test } from "bun:test";
import sharp from "sharp";
import { s3Store } from "../fakes";

mock.module("next/cache", () => ({ cacheLife: () => {} }));
const { isThumbWidth, thumbnail } = await import("@/lib/thumbnail");

describe("thumbnail", () => {
  test("only the fixed widths are accepted", () => {
    expect(isThumbWidth(480)).toBe(true);
    expect(isThumbWidth(960)).toBe(true);
    expect(isThumbWidth(500)).toBe(false);
    expect(isThumbWidth(NaN)).toBe(false);
  });

  test("a picture is shrunk to the width as WebP", async () => {
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#204080" } }).png().toBuffer();
    s3Store.set("pics/big.png", new Uint8Array(png));
    const out = await thumbnail("pics/big.png", 480);
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(240);
  });

  test("a small picture is not blown up", async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).png().toBuffer();
    s3Store.set("pics/small.png", new Uint8Array(png));
    expect((await sharp((await thumbnail("pics/small.png", 960))!).metadata()).width).toBe(300);
  });

  test("something that is not a picture gives null", async () => {
    s3Store.set("clips/a.mp4", new TextEncoder().encode("not an image"));
    expect(await thumbnail("clips/a.mp4", 480)).toBeNull();
  });
});
