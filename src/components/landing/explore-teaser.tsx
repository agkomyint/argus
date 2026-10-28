import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { listShared } from "@/lib/explore";
import { ReplayCard } from "./replay-card";
import { Section } from "./section-heading";

/** One shared project as a replay card: poster, play button and a hover preview. */
export const SharedCard = ReplayCard;

/** Landing section: the newest projects people chose to share. Hidden until someone shares one. */
export async function ExploreTeaser() {
  const shared = await listShared(3);
  if (!shared.length) return null;
  return (
    <Section
      id="explore"
      index="07"
      label="Explore"
      title="Watch real projects run."
      intro="People share their projects here: every data product it makes, the rows behind it, and a replay of each source and agent from the first day to now."
    >
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 md:grid-cols-3">
        {shared.map((p) => <SharedCard key={p.slug} p={p} />)}
      </div>
      <Link href="/explore" className="mt-6 inline-flex items-center gap-1.5 text-sm text-electric underline-offset-4 hover:underline">
        All shared projects <ArrowRight className="size-4" />
      </Link>
    </Section>
  );
}
