import { generateText, Output } from "ai";
import { z } from "zod";
import { chatModel } from "@/lib/meta";

console.log("model:", process.env.META_MODEL);
const t = await generateText({ model: chatModel(), prompt: "Reply with the single word: ready" });
console.log("text:", t.text.trim());
const o = await generateText({ model: chatModel(), output: Output.object({ schema: z.object({ ok: z.boolean(), n: z.number() }) }), prompt: "Return ok=true and n=2+2." });
console.log("structured:", JSON.stringify(o.output));
process.exit(0);
