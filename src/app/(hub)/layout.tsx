import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { Logo } from "@/components/landing/logo";
import { NewProjectDialog } from "@/components/dashboard/new-project-dialog";
import { getAccount } from "@/lib/session";
import { pickableProducts } from "@/lib/pickable";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<div className="h-14 border-b" />}>
        <Header />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8">
        <Suspense fallback={<div aria-busy="true" className="h-64 animate-pulse bg-muted" />}>{children}</Suspense>
      </main>
    </div>
  );
}

async function Header() {
  const account = await getAccount();
  if (!account) redirect("/login");
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 sm:px-8">
      <div className="flex items-center gap-4">
        <Link href="/" aria-label="ARGUS home">
          <Logo />
        </Link>
        <span className="h-5 w-px bg-border" aria-hidden />
        <Link href="/projects" className="text-sm font-medium hover:text-electric">Your projects</Link>
      </div>
      <div className="flex items-center gap-4">
        <NewProjectDialog items={pickableProducts()} />
        <span className="hidden font-mono text-[11px] text-muted-foreground sm:block">{account.user.email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
