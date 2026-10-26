"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, isOAuthLogin } from "@/lib/auth-client";
import { DEMO_PASSWORD, DEMO_USERS } from "@/demo-users";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ error: { message?: string } | null }>) {
    setBusy(true);
    setError("");
    const { error } = await action();
    if (error) {
      setError(error.message ?? "Something went wrong");
      setBusy(false);
      return;
    }
    // A coding agent asked for access: the auth client is already redirecting to the consent screen.
    if (isOAuthLogin()) return;
    router.push("/projects");
    router.refresh();
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    void run(() =>
      mode === "in"
        ? authClient.signIn.email({ email, password })
        : authClient.signUp.email({ email, password, name: String(f.get("name")) }),
    );
  }

  return (
    <>
      <h1 className="text-2xl font-medium">Sign in as a demo user</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Each account has its own project and data. Pick a role to explore the workspace.
      </p>

      <ul className="mt-8 border-t">
        {DEMO_USERS.map((u) => (
          <li key={u.email} className="border-b">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => authClient.signIn.email({ email: u.email, password: DEMO_PASSWORD }))}
              className="flex w-full items-baseline justify-between gap-4 px-1 py-4 text-left transition-colors hover:bg-accent/40 disabled:opacity-50"
            >
              <span>
                <span className="block font-medium">{u.name}</span>
                <span className="block text-sm text-muted-foreground">{u.role}</span>
              </span>
              <span className="text-right font-mono text-xs text-muted-foreground">{u.project.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="mt-10 space-y-3">
        <p className="font-mono text-xs text-muted-foreground">{mode === "in" ? "Or use your own account" : "Create an account"}</p>
        {mode === "up" && <Input name="name" placeholder="Name" required autoComplete="name" />}
        <Input name="email" type="email" placeholder="Email" required autoComplete="email" />
        <Input name="password" type="password" placeholder="Password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-4">
          <Button type="submit" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
          <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Create an account" : "I have an account"}
          </button>
        </div>
      </form>
    </>
  );
}
