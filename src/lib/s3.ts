import { S3Client } from "bun";

// Bun's native S3 client, pointed at Supabase Storage. Server-only: needs `bun --bun next`.
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  bucket: process.env.S3_BUCKET,
});

export function presignUpload(key: string, opts: { contentType?: string; expiresIn?: number } = {}) {
  return s3.presign(key, { method: "PUT", expiresIn: opts.expiresIn ?? 300, type: opts.contentType });
}

export function presignDownload(key: string, expiresIn = 300) {
  return s3.presign(key, { method: "GET", expiresIn });
}
