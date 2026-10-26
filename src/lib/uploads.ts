export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

// Accepted source files: visual, tabular, geospatial and documents.
const EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "mp4", "mov", "webm",
  "csv", "xlsx", "xls", "json", "geojson", "parquet", "pdf",
];

export function extensionOf(filename: string) {
  return filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
}

export function isAllowedFile(filename: string) {
  return EXTENSIONS.includes(extensionOf(filename));
}

export function safeName(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
}
