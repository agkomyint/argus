import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { auth } from "@/lib/auth";

export const PROJECT_COOKIE = "argus_project";

// The signed-in user and all their projects. Null when signed out. Cached per request.
export const getAccount = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const list = await db.select().from(projects).where(eq(projects.userId, session.user.id)).orderBy(asc(projects.createdAt));
  return { user: session.user, projects: list };
});

// The account plus the project the user chose to open (cookie). Null when signed out OR when no project
// has been opened yet; the app layout sends those users to /projects to choose one.
export const getWorkspace = cache(async () => {
  const account = await getAccount();
  if (!account) return null;
  const wanted = (await cookies()).get(PROJECT_COOKIE)?.value;
  const project = account.projects.find((p) => p.id === wanted);
  return project ? { ...account, project } : null;
});
