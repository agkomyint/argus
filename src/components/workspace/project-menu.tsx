"use client";

import { Globe, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DeleteProjectDialog } from "@/components/workspace/delete-project-dialog";
import { EditProjectDialog } from "@/components/workspace/edit-project-dialog";
import { ShareProjectDialog } from "@/components/workspace/share-project-dialog";

/** The ⋯ on a project card: edit, share and delete, each opening its dialog. */
export function ProjectMenu({ id, name, description, slug, media }: { id: string; name: string; description: string; slug: string | null; media?: boolean }) {
  const [dialog, setDialog] = useState<"edit" | "share" | "delete" | null>(null);
  const shut = (o: boolean) => { if (!o) setDialog(null); };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`More for ${name}`} />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setDialog("edit")}><Pencil />Edit details</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("share")}>
            <Globe className={slug ? "text-electric" : undefined} />{slug ? "Public · manage" : "Share"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditProjectDialog id={id} name={name} description={description} open={dialog === "edit"} onOpenChange={shut} />
      <ShareProjectDialog id={id} name={name} slug={slug} media={media} open={dialog === "share"} onOpenChange={shut} />
      <DeleteProjectDialog id={id} name={name} open={dialog === "delete"} onOpenChange={shut} />
    </>
  );
}
