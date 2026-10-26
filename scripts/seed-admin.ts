import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../src/db";
import * as schema from "../src/db/schema";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local");

const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
});

const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email));
if (existing) {
  console.log("admin already exists:", email);
} else {
  await auth.api.signUpEmail({ body: { email, name: "Admin", password } });
  console.log("created admin:", email);
}
console.log("Make sure ADMIN_EMAILS includes", email);
process.exit(0);
