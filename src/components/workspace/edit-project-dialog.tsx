"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { updateProjectDetails, type ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Name and description of a project: what its slide says about it. Pass `open` to drive it from a menu; it then has no button. */
export function EditProjectDialog({ id, name, description, label = "Edit", ...ctl }: {
  id: string; name: string; description: string; label?: string; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const open = ctl.open ?? own;
  const setOpen = ctl.onOpenChange ?? setOwn;
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await updateProjectDetails(id, prev, form);
    if (!r?.error) setOpen(false);
    return r;
  }, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {ctl.open === undefined && (
        <DialogTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}>
          <Pencil className="size-4" />{label}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project details</DialogTitle>
          <DialogDescription>Shown on the project&apos;s slide and at the top of its studio.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={`name-${id}`} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Name</label>
            <Input id={`name-${id}`} name="name" defaultValue={name} required minLength={2} maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`about-${id}`} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">What it watches</label>
            <Textarea id={`about-${id}`} name="description" defaultValue={description} maxLength={280} rows={3} placeholder="e.g. Foot traffic and crowding at the north entrance, weekdays." />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
