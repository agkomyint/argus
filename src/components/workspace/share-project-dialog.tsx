"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProjectShareMedia, setProjectShared } from "@/app/actions";
import { CopyLine } from "@/components/workspace/connect-kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const SHOWN = ["The project name and your first name", "Each data product's widget, its rows and CSV downloads", "The replay: sources, models, what each one returned, from day one to now"];
const HIDDEN = ["Your email, API keys and source settings", "Anything in the assistant chats"];
const MEDIA = "Photos, videos and screen frames";
const MEDIA_NOTE = "Screen frames are kept only from now on; earlier ones were deleted after analysis. Frames can show people's faces.";

/** Share a project on /explore. Nothing goes public until the owner ticks the box and presses Share. Pass `open` to drive it from a menu. */
export function ShareProjectDialog({ id, name, slug, media = false, ...ctl }: {
  id: string; name: string; slug: string | null;
  /** The owner also shows photos, videos and kept screen frames. */
  media?: boolean;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [own, setOwn] = useState(false);
  const open = ctl.open ?? own;
  const setOpen = ctl.onOpenChange ?? setOwn;
  const [agree, setAgree] = useState(false);
  const [withMedia, setWithMedia] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const url = slug && typeof window !== "undefined" ? `${window.location.origin}/explore/${slug}` : slug ? `/explore/${slug}` : "";

  const set = (on: boolean) =>
    start(async () => {
      const r = await setProjectShared(id, on, on && withMedia);
      if (r.error) return setError(r.error);
      setAgree(false);
      setWithMedia(false);
      router.refresh();
    });
  const showMedia = (on: boolean) =>
    start(async () => {
      const r = await setProjectShareMedia(id, on);
      if (r.error) return setError(r.error);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setAgree(false); setWithMedia(false); setError(""); }}>
      {ctl.open === undefined && (
        <DialogTrigger render={<Button variant="ghost" size="sm" className={slug ? "text-electric" : "text-muted-foreground"} aria-label={`Share ${name}`} />}>
          <Globe className="size-4" />{slug ? "Public" : "Share"}
        </DialogTrigger>
      )}
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
            <a href={`/explore/${slug}`} target="_blank" rel="noreferrer" className="inline-block text-sm text-electric underline-offset-4 hover:underline">Open the public replay →</a>
            <label className="flex items-start gap-3 border p-3 text-sm">
              <Switch checked={media} disabled={pending} onCheckedChange={showMedia} className="mt-0.5" aria-label="Show media" />
              <span>
                <span className="block font-medium">Show media</span>
                <span className="block text-xs text-muted-foreground">
                  {media ? "Visitors can open the photos, videos and screen frames. Turning this off deletes the kept frames." : `${MEDIA} stay private. ${MEDIA_NOTE}`}
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">People will see</p>
              <ul className="list-disc space-y-1 pl-4">{SHOWN.map((s) => <li key={s}>{s}</li>)}{withMedia && <li>{MEDIA}</li>}</ul>
            </div>
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Stays private</p>
              <ul className="list-disc space-y-1 pl-4 text-muted-foreground">{!withMedia && <li>{MEDIA}</li>}{HIDDEN.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <label className="flex items-start gap-2 border border-dashed p-3 sm:col-span-2">
              <input type="checkbox" checked={withMedia} onChange={(e) => setWithMedia(e.target.checked)} className="mt-0.5 accent-electric" />
              <span>
                Also show media: {MEDIA.toLowerCase()}, so visitors can open them in the replay.
                <span className="mt-0.5 block text-xs text-muted-foreground">{MEDIA_NOTE}</span>
              </span>
            </label>
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
