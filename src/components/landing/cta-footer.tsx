import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

export function CtaFooter() {
  return (
    <>
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2 className="max-w-3xl text-balance text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
            Start observing the world.
          </h2>
          <p className="mt-4 text-muted-foreground">Connect your first stream in minutes.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/studio" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")}>
              Open ARGUS Studio <ArrowRight />
            </Link>
            <Link href="/products" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 px-5")}>
              Browse the catalog
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo className="text-foreground" />
        <nav className="flex gap-6">
          <Link href="/products" className="hover:text-foreground">Catalog</Link>
          <Link href="/explore" className="hover:text-foreground">Explore</Link>
          <Link href="/studio" className="hover:text-foreground">Studio</Link>
          <Link href="/docs" className="hover:text-foreground">Docs</Link>
          <Link href="/ARGUS_Visual_Data_Products_Whitepaper_v0.1.pdf" target="_blank" className="hover:text-foreground">Whitepaper</Link>
        </nav>
        <p>© 2026 ARGUS</p>
      </div>
    </footer>
  );
}
