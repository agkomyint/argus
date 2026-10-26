import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Meta Model API (Muse models) exposes an OpenAI-compatible Chat Completions protocol.
export const META_CONFIGURED = Boolean(process.env.META_API_KEY);

const meta = createOpenAICompatible({
  name: "meta",
  baseURL: process.env.META_BASE_URL ?? "https://api.meta.ai/v1",
  apiKey: process.env.META_API_KEY,
  supportsStructuredOutputs: true,
});

export const chatModel = () => meta(process.env.META_MODEL ?? "muse-spark-1.3");
