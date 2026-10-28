import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { listShared, SHARED_LIST_TAG, type SharedProject } from "@/lib/explore";
import { LandingExplore } from "./explore-showcase";

/**
 * The newest shared projects, cached for a minute or so. Every visitor sees the same list, so it is read once
 * and reused instead of counting every project's rows per visit. The share actions clear it at once.
 */
export async function sharedList(limit?: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(SHARED_LIST_TAG);
  return listShared(limit);
}

export async function LandingExploreData() {
  // Read when a visitor asks, not at build: the build has no database. The list itself stays cached.
  await connection();
  let projects: SharedProject[] = [];
  try {
    projects = await sharedList(5);
  } catch {
    // The landing page still renders when the database is away.
  }
  return <LandingExplore projects={projects} />;
}
