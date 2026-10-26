"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProjectShared } from "@/app/actions";
import { CopyLine } from "@/components/dashboard/connect-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const SHOWN = ["The project name and your first name", "Each data product's widget, its rows and CSV downloads", "The replay: sources, agents and what they did, from day one to now"];
const HIDDEN = ["Uploaded files, screen frames and photos", "Your email, API keys and source settings", "Anything in the assistant chats"];

/** Share a project on /explore. Nothing goes public until the owner ticks the box and presses Share. */
export function ShareProjectDialog({ id, name, slug }: { id: string; name: string; slug: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const url = slug && typeof window !== "undefined" ? `${window.location.origin}/explore/${slug}` : slug ? `/explore/${slug}` : "";

  const set = (on: boolean) =>
    start(async () => {
      const r = await setProjectShared(id, on);
      if (r.error) return setError(r.error);
      setAgree(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setAgree(false); setError(""); }}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className={slug ? "text-electric" : "text-muted-foreground"} aria-label={`Share ${name}`} />}>
        <Globe className="size-4" />{slug ? "Public" : "Share"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{slug ? `“${name}” is public` : `Share “${name}” on Explore?`}</DialogTitle>
          <DialogDescription>
            {slug ? "Anyone with the link can watch it, and it is listed on Explore." : "Anyone can then see it on the ARGUS Explore page, without signing in."}
          </DialogDescription>
        </DialogHeader>

        {slug ? (
          <div className="space-y-3">
            <CopyLine text={url} />
            <a href={`/explore/${slug}`} target="_blank" rel="noreferrer" className="inline-block text-sm text-electric underline-offset-4 hover:underline">Open the public page →</a>
          </div>
        ) : (
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">People will see</p>
              <ul className="list-disc space-y-1 pl-4">{SHOWN.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stays private</p>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">{HIDDEN.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <label className="flex items-start gap-2 border p-3 sm:col-span-2">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-electric" />
              <span>I agree to make this project&apos;s data products and replay public. I can stop sharing at any time.</span>
            </label>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-2">
          <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
          {slug ? (
            <Button variant="destructive" disabled={pending} onClick={() => set(false)}>{pending ? "Stopping…" : "Stop sharing"}</Button>
          ) : (
            <Button disabled={pending || !agree} onClick={() => set(true)}>{pending ? "Sharing…" : "Share publicly"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
