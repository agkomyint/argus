"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Allow or deny a coding agent. The auth client signs the page's OAuth query into the request and follows the redirect back to the agent. */
export function ConsentForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function answer(accept: boolean) {
    setBusy(true);
    setError("");
    const { data, error } = await authClient.$fetch<{ url?: string }>("/oauth2/consent", { method: "POST", body: { accept } });
    if (error || !data?.url) {
      setError(error?.message ?? "Could not reach the agent. Start again from your coding agent.");
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="mt-8 grid gap-3">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button disabled={busy} onClick={() => answer(true)}>{busy ? "Connecting…" : "Allow"}</Button>
        <Button variant="outline" disabled={busy} onClick={() => answer(false)}>Deny</Button>
      </div>
    </div>
  );
}
