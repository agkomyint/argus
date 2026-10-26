import { desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { projectProducts, projects, uploads, user } from "@/db/schema";
import { PageHeader, SectionTitle } from "@/components/dashboard/page-header";
import { isAdmin } from "@/lib/admin";
import { formatSize } from "@/lib/format";
import { kindLabel } from "@/lib/projects";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Admin — ARGUS" };

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function AdminPage() {
  const ws = (await getWorkspace())!;
  if (!isAdmin(ws.user.email)) notFound();

  const [users, projectRows, recent, enabled] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        projects: sql<number>`(select count(*)::int from ${projects} where ${projects.userId} = "user"."id")`,
        files: sql<number>`(select count(*)::int from ${uploads} where ${uploads.userId} = "user"."id" and ${uploads.status} = 'ready')`,
        bytes: sql<number>`(select coalesce(sum(${uploads.size}), 0)::float8 from ${uploads} where ${uploads.userId} = "user"."id" and ${uploads.status} = 'ready')`,
      })
      .from(user)
      .orderBy(desc(user.createdAt)),
    db
      .select({
        id: projects.id,
        name: projects.name,
        kind: projects.kind,
        owner: user.email,
        createdAt: projects.createdAt,
        files: sql<number>`(select count(*)::int from ${uploads} where ${uploads.projectId} = "projects"."id" and ${uploads.status} = 'ready')`,
        products: sql<number>`(select count(*)::int from ${projectProducts} where ${projectProducts.projectId} = "projects"."id")`,
      })
      .from(projects)
      .innerJoin(user, eq(user.id, projects.userId))
      .orderBy(desc(projects.createdAt)),
    db
      .select({ id: uploads.id, filename: uploads.filename, size: uploads.size, createdAt: uploads.createdAt, project: projects.name, owner: user.email })
      .from(uploads)
      .innerJoin(projects, eq(projects.id, uploads.projectId))
      .innerJoin(user, eq(user.id, uploads.userId))
      .where(eq(uploads.status, "ready"))
      .orderBy(desc(uploads.createdAt))
      .limit(20),
    db.select({ n: sql<number>`count(*)::int` }).from(projectProducts),
  ]);

  const totalBytes = users.reduce((n, u) => n + u.bytes, 0);

  return (
    <>
      <PageHeader title="Admin" description="Read-only view of everything on the platform. File contents are not shown." />

      <dl className="grid grid-cols-2 divide-x border-y sm:grid-cols-4">
        <Stat label="Users" value={String(users.length)} />
        <Stat label="Projects" value={String(projectRows.length)} />
        <Stat label="Products enabled" value={String(enabled[0]?.n ?? 0)} />
        <Stat label="Storage" value={formatSize(totalBytes)} />
      </dl>

      <section className="mt-12">
        <SectionTitle>Users</SectionTitle>
        <ul>
          {users.map((u) => (
            <li key={u.id} className="grid grid-cols-[1fr_auto] gap-2 border-b py-3 text-sm sm:grid-cols-[1fr_12rem_4rem_4rem_6rem_6rem]">
              <span className="min-w-0 truncate"><span className="font-medium">{u.name}</span> <span className="text-muted-foreground">{u.email}</span></span>
              <span className="hidden sm:block" />
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">{u.projects} proj</span>
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">{u.files} files</span>
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">{formatSize(u.bytes)}</span>
              <span className="text-right font-mono text-xs text-muted-foreground">{day(u.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <SectionTitle>Projects</SectionTitle>
        <ul>
          {projectRows.map((p) => (
            <li key={p.id} className="grid grid-cols-[1fr_auto] gap-2 border-b py-3 text-sm sm:grid-cols-[1fr_9rem_14rem_4rem_4rem]">
              <span className="font-medium">{p.name}</span>
              <span className="hidden text-muted-foreground sm:block">{kindLabel(p.kind)}</span>
              <span className="hidden truncate text-muted-foreground sm:block">{p.owner}</span>
              <span className="hidden font-mono text-xs text-muted-foreground sm:block">{p.files} files</span>
              <span className="text-right font-mono text-xs text-muted-foreground">{p.products} prod</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <SectionTitle>Recent uploads</SectionTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No uploads yet.</p>
        ) : (
          <ul>
            {recent.map((f) => (
              <li key={f.id} className="grid grid-cols-[1fr_auto] gap-2 border-b py-3 text-sm sm:grid-cols-[1fr_10rem_14rem_5rem_6rem]">
                <span className="truncate">{f.filename}</span>
                <span className="hidden truncate text-muted-foreground sm:block">{f.project}</span>
                <span className="hidden truncate text-muted-foreground sm:block">{f.owner}</span>
                <span className="hidden font-mono text-xs text-muted-foreground sm:block">{formatSize(f.size)}</span>
                <span className="text-right font-mono text-xs text-muted-foreground">{day(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4 first:pl-0">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}
