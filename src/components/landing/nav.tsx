import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "./logo";

const links = [
  { href: "/products", label: "Catalog" },
  { href: "/explore", label: "Explore" },
  { href: "/#stream", label: "Platform" },
  { href: "/#sources", label: "Sources" },
  { href: "/#environments", label: "Environments" },
  { href: "/#pipeline", label: "Architecture" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="ARGUS home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
          Launch Workspace
        </Link>
      </div>
    </header>
  );
}
