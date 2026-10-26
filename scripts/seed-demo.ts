import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../src/db";
import * as schema from "../src/db/schema";
import { DEMO_PASSWORD, DEMO_USERS } from "../src/demo-users";

// Same config as src/lib/auth.ts minus nextCookies, which needs a request context.
const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
});

for (const u of DEMO_USERS) {
  let [row] = await db.select().from(schema.user).where(eq(schema.user.email, u.email));
  if (!row) {
    await auth.api.signUpEmail({ body: { email: u.email, name: u.name, password: DEMO_PASSWORD } });
    [row] = await db.select().from(schema.user).where(eq(schema.user.email, u.email));
    console.log("created", u.email);
  }
  const existing = await db.select().from(schema.projects).where(eq(schema.projects.userId, row.id));
  if (existing.length === 0) {
    await db.insert(schema.projects).values({ userId: row.id, ...u.project });
    console.log("project", u.project.name);
  }
}
process.exit(0);
