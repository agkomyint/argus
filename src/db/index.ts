import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare: false is required for Supabase's transaction pooler (port 6543).
// A studio opens with a couple of dozen reads at once, so the pool is wider than postgres.js's default of 10.
// The client is kept on globalThis so dev reloads reuse its connections instead of opening a new pool each time.
const shared = globalThis as unknown as { argusSql?: ReturnType<typeof postgres> };
const client = (shared.argusSql ??= postgres(process.env.DATABASE_URL!, { prepare: false, max: 20 }));

export const db = drizzle(client, { schema });
