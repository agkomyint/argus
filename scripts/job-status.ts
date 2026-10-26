import { desc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { jobs } from "../src/db/schema";
const rows = await db.select().from(jobs).where(eq(jobs.projectId, process.argv[2])).orderBy(desc(jobs.createdAt));
for (const j of rows) console.log(j.kind, j.status, j.attempts, j.error ?? JSON.stringify(j.result));
process.exit(0);
