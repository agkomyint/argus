import { redirect } from "next/navigation";

// Raw rows now live inside each data product (and download as CSV from there).
export default function ObservationsPage() {
  redirect("/dashboard");
}
