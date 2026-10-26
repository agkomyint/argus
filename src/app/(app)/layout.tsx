import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { isAdmin } from "@/lib/admin";
import { getAccount, getWorkspace } from "@/lib/session";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const ws = await getWorkspace();
  if (!(await getAccount())) redirect("/login");
  // Signed in but no project opened yet: choose one first.
  if (!ws) redirect("/projects");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        user={{ name: ws.user.name, email: ws.user.email }}
        project={{ name: ws.project.name }}
        isAdmin={isAdmin(ws.user.email)}
      />
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
