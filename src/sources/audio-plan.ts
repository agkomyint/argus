// Browser and server agree on the normalized audio contract.
export const AUDIO_RATE = 16000;
export const MAX_AUDIO_MS = 9 * 60_000;
export const MAX_AUDIO_BYTES = 44 + AUDIO_RATE * 2 * MAX_AUDIO_MS / 1000;

export function wavOf(samples: Float32Array, rate = AUDIO_RATE): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const tag = (at: number, text: string) => [...text].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF"); v.setUint32(4, out.length - 8, true); tag(8, "WAVE"); tag(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * (s < 0 ? 32768 : 32767)), true));
  return out;
}

export function wavDuration(bytes: Uint8Array) {
  if (bytes.length < 44 || bytes.length > MAX_AUDIO_BYTES) throw new Error("Audio is empty or exceeds nine minutes");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number, n: number) => String.fromCharCode(...bytes.slice(at, at + n));
  if (tag(0, 4) !== "RIFF" || tag(8, 4) !== "WAVE" || tag(12, 4) !== "fmt " || v.getUint32(16, true) !== 16 || v.getUint16(20, true) !== 1 || v.getUint16(22, true) !== 1 || v.getUint32(24, true) !== AUDIO_RATE || v.getUint16(34, true) !== 16 || tag(36, 4) !== "data" || v.getUint32(40, true) !== bytes.length - 44 || bytes.length % 2) throw new Error("Expected normalized mono 16-bit 16 kHz WAV");
  return (bytes.length - 44) / (AUDIO_RATE * 2) * 1000;
}
