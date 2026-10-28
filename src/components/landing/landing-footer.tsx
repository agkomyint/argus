import Link from "next/link";
import { Logo } from "./logo";

export function LandingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" aria-label="ARGUS home"><Logo /></Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Projects</Link>
          <Link href="/explore" className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Explore</Link>
          <Link href="/products" className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Data products</Link>
          <Link href="/docs" className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Docs</Link>
        </nav>
        <p className="font-mono text-xs text-muted-foreground">Meta AI Hackathon 2026</p>
      </div>
    </footer>
  );
}
