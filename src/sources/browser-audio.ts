import { AUDIO_RATE, MAX_AUDIO_MS, wavOf } from "./audio-plan";

/** Decode locally; only normalized audio reaches the server. */
export async function normalizeAudio(file: File) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (!decoded.duration || decoded.duration * 1000 > MAX_AUDIO_MS) throw new Error("Choose an audio clip of nine minutes or less");
    const renderer = new OfflineAudioContext(1, Math.ceil(decoded.duration * AUDIO_RATE), AUDIO_RATE);
    const source = renderer.createBufferSource(); source.buffer = decoded; source.connect(renderer.destination); source.start();
    const mono = await renderer.startRendering();
    const wav = wavOf(mono.getChannelData(0));
    return new File([wav.buffer as ArrayBuffer], file.name.replace(/\.[^.]+$/, "") + ".wav", { type: "audio/wav" });
  } finally { await context.close(); }
}
