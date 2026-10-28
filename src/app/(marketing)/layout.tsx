import { Nav } from "@/components/landing/nav";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <><Nav />{children}</>;
}
