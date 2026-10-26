import type { Metadata } from "next";
import { ProductsHome } from "@/components/dashboard/products-home";
import { getWorkspace } from "@/lib/session";

export const metadata: Metadata = { title: "Data products — ARGUS" };

export default async function OverviewPage() {
  const ws = (await getWorkspace())!;
  return <ProductsHome project={ws.project} />;
}
