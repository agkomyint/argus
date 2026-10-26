"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, ChevronsUpDown, History, LayoutDashboard, LogOut, Plug, ShieldCheck, Sparkles, SquareTerminal, Waypoints } from "lucide-react";
import { Logo } from "@/components/landing/logo";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { VersionTag } from "./version-tag";

const NAV = [
  { href: "/dashboard", label: "Data products", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/sources", label: "Sources", icon: Plug },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/flows", label: "Flows", icon: Waypoints },
  { href: "/dashboard/replay", label: "Replay", icon: History },
  { href: "/dashboard/assistant", label: "Assistant", icon: Sparkles },
  { href: "/dashboard/connect", label: "Connect an agent", icon: SquareTerminal },
];

type Props = {
  user: { name: string; email: string };
  project: { name: string };
  isAdmin?: boolean;
};

export function Sidebar({ user, project, isAdmin }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link href="/" aria-label="ARGUS home">
          <Logo />
        </Link>
        <VersionTag />
      </div>

      <div className="px-2 pb-4">
        <p className="px-0.5 pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Project</p>
        <Link href="/projects" title="Switch or create a project" className="flex items-center justify-between gap-2 border px-2.5 py-2 text-sm hover:bg-accent/50">
          <span className="truncate font-medium">{project.name}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-2 md:flex-1 md:flex-col md:overflow-visible">
        {(isAdmin ? [...NAV, { href: "/dashboard/admin", label: "Admin", icon: ShieldCheck, exact: false }] : NAV).map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 whitespace-nowrap px-2.5 py-2 text-sm transition-colors hover:bg-accent/50",
                active ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t p-4">
        <div className="min-w-0">
          <p className="truncate text-sm">{user.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{user.email}</p>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          className="text-muted-foreground hover:text-foreground"
          onClick={async () => {
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
