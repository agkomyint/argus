import { sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, user } from "@/db/schema";
import { resetFakes } from "./fakes";

/** Empty every table and the fakes. Call in beforeEach of any test that touches the database. */
export async function reset() {
  const rows = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'`);
  const names = (rows as unknown as { rows?: { tablename: string }[] }).rows ?? (rows as unknown as { tablename: string }[]);
  if (names.length) await db.execute(sql.raw(`truncate ${names.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`));
  resetFakes();
}

let n = 0;

/** A user and one project they own. */
export async function seedProject(over: Partial<typeof projects.$inferInsert> = {}) {
  n++;
  const [u] = await db.insert(user).values({ id: `user-${n}`, name: `Test User ${n}`, email: `user${n}@test.dev`, emailVerified: true }).returning();
  const [p] = await db.insert(projects).values({ userId: u.id, name: `Project ${n}`, kind: "bridge", ...over }).returning();
  return { user: u, project: p };
}
