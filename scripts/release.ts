/**
 * Prepare a release, or print the notes for one.
 *
 *   bun run release 0.1.0            cut CHANGELOG "Unreleased" into 0.1.0, set package.json, run checks
 *   bun run release patch|minor|major
 *   bun run release 0.1.0 --skip-checks
 *   bun run release notes 0.1.0      print that version's CHANGELOG section (used by release.yml)
 *
 * It never commits, tags or pushes. It prints the git commands for a maintainer to run.
 */
import { main } from "./release-lib";

try {
  await main(process.argv.slice(2));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
