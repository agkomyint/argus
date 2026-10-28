import { redirect } from "next/navigation";
import { getAccount, getWorkspace } from "@/lib/session";

// A redirect with nothing to show, so it waits for the session instead of streaming an empty shell.
export const instant = false;

/** /studio opens the project you had open last, or the chooser when there is none. */
export default async function StudioIndex() {
  if (!(await getAccount())) redirect("/login");
  const ws = await getWorkspace();
  redirect(ws ? `/studio/${ws.project.id}` : "/projects");
}
