/** State behind the fakes in preload.ts. Tests script it; resetFakes() clears it between tests. */

export const s3Store = new Map<string, Uint8Array>();

type Reply = unknown | ((req: unknown) => unknown);
const replies: Reply[] = [];
export const modelCalls: unknown[] = [];

/** Queue what the next model call(s) return, in order. A function gets the request. */
export function scriptModel(...next: Reply[]) {
  replies.push(...next);
}

export async function takeReply(req: unknown) {
  modelCalls.push(req);
  if (!replies.length) throw new Error("Model called with no scripted reply");
  const r = replies.shift();
  return typeof r === "function" ? (r as (q: unknown) => unknown)(req) : r;
}

/** Callbacks handed to next/server's after(). Tests run them with runAfter() when they care. */
export const scheduled: (() => unknown)[] = [];

export async function runAfter() {
  for (const cb of scheduled.splice(0)) await cb();
}

export function putFile(key: string, body: string | Uint8Array) {
  s3Store.set(key, typeof body === "string" ? new TextEncoder().encode(body) : body);
}

export function resetFakes() {
  s3Store.clear();
  replies.length = 0;
  modelCalls.length = 0;
  scheduled.length = 0;
}
