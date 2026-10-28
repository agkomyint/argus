"use server";

import { revalidatePath } from "next/cache";
import { OpsError, setProducts } from "@/lib/ops";
import { getAccount } from "@/lib/session";

/** Add or remove one data product from a project the signed-in user owns. */
export async function toggleProjectProduct(projectId: string, productId: string, on: boolean): Promise<{ error?: string }> {
  const account = await getAccount();
  if (!account) return { error: "Sign in again." };
  try {
    await setProducts(account.user.id, projectId, on ? { add: [productId] } : { remove: [productId] });
  } catch (e) {
    if (e instanceof OpsError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/studio/${projectId}`);
  revalidatePath("/projects");
  return {};
}
