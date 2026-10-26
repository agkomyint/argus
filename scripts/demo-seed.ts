// Seeds bridge context (no detection) for a user's oldest project. Run: bun --conditions react-server scripts/demo-seed.ts <email>
import { asc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { projects, user } from "../src/db/schema";
import { seedSample } from "../src/lib/sample";
const [u] = await db.select().from(user).where(eq(user.email, process.argv[2]));
const [p] = await db.select().from(projects).where(eq(projects.userId, u.id)).orderBy(asc(projects.createdAt));
await seedSample(p.id, { withDetection: false });
console.log(p.id, p.name);
process.exit(0);
