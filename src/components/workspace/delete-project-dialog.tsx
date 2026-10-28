"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Pass `open` to drive it from a menu; it then has no button. */
export function DeleteProjectDialog({ id, name, ...ctl }: { id: string; name: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const router = useRouter();
  const [own, setOwn] = useState(false);
  const open = ctl.open ?? own;
  const setOpen = ctl.onOpenChange ?? setOwn;
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const r = await deleteProject(id, typed);
      if (r.error) return setError(r.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setTyped(""); setError(""); }}>
      {ctl.open === undefined && (
        <DialogTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${name}`} />}>
          <Trash2 className="size-4" />Delete
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            This removes the project for good: its data products, sources, uploaded files, flows, chats and all the data it produced. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); confirm(); }} className="space-y-2">
          <label className="block text-sm">
            <span className="text-muted-foreground">Type <span className="font-medium text-foreground">{name}</span> to confirm</span>
            <Input value={typed} onChange={(e) => { setTyped(e.target.value); setError(""); }} autoFocus autoComplete="off" className="mt-1.5" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-4">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== name}>{pending ? "Deleting…" : "Delete project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
