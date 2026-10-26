"use client";

import { Check, Copy } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { makeApiKey } from "@/app/connect-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A command or key in a box, with a copy button. */
export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch border bg-muted/40">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-xs">{text}</code>
      <button
        type="button"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="border-l px-3 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

/** Make a key and show it, once, as the command to paste. */
export function NewKeyForm({ mcpUrl }: { mcpUrl: string }) {
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    start(async () => setKey(await makeApiKey(name)));
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <Input name="name" placeholder="Name it, e.g. Muse on my laptop" maxLength={60} className="max-w-xs" />
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "Making…" : "Make a key"}</Button>
      </form>
      {key && (
        <div className="space-y-2 border border-electric p-3">
          <p className="text-sm">Copy it now. ARGUS keeps only a fingerprint, so it cannot show this key again.</p>
          <CopyLine text={key} />
          <p className="pt-1 text-xs text-muted-foreground">Or add it to Claude Code in one go:</p>
          <CopyLine text={`claude mcp add --transport http argus ${mcpUrl} --header "Authorization: Bearer ${key}"`} />
        </div>
      )}
    </div>
  );
}
