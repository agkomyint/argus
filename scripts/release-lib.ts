/** Release logic behind scripts/release.ts. Kept apart so tests can import it without running the CLI. */
import { $ } from "bun";

export const BUMPS = ["patch", "minor", "major"] as const;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const UNRELEASED = "## [Unreleased]";

/** The version to release: an explicit x.y.z, or a bump of the current one. */
export function nextVersion(current: string, want: string) {
  if (SEMVER.test(want)) return want;
  const i = BUMPS.indexOf(want as (typeof BUMPS)[number]);
  if (i < 0) throw new Error(`Give a version like 0.1.0 or one of: ${BUMPS.join(", ")}`);
  const [major, minor, patch] = current.split("-")[0].split(".").map(Number);
  return [`${major}.${minor}.${patch + 1}`, `${major}.${minor + 1}.0`, `${major + 1}.0.0`][i];
}

/** Versions that already have a section, newest first as written. */
export const releasedVersions = (changelog: string) => [...changelog.matchAll(/^## \[(\d[^\]]*)\]/gm)].map((m) => m[1]);

/** Move everything under Unreleased into a dated section for `version`, leaving an empty Unreleased on top. */
export function cutChangelog(changelog: string, version: string, date: string) {
  if (releasedVersions(changelog).includes(version)) throw new Error(`CHANGELOG.md already has ${version}`);
  const at = changelog.indexOf(UNRELEASED);
  if (at < 0) throw new Error(`CHANGELOG.md has no "${UNRELEASED}" section`);
  const start = at + UNRELEASED.length;
  const next = changelog.indexOf("\n## [", start);
  const end = next < 0 ? changelog.length : next;
  const body = changelog.slice(start, end).trim();
  if (!body) throw new Error("Nothing under Unreleased. Write what changed before releasing.");
  return `${changelog.slice(0, at)}${UNRELEASED}\n\n## [${version}] - ${date}\n\n${body}\n${changelog.slice(end)}`;
}

/** The body of one version's section, for the GitHub Release. */
export function notesFor(changelog: string, version: string) {
  const head = changelog.match(new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\].*$`, "m"));
  if (!head || head.index === undefined) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const start = head.index + head[0].length;
  const next = changelog.indexOf("\n## [", start);
  return changelog.slice(start, next < 0 ? undefined : next).trim();
}

/** A new version must be ahead of every released one (the first release may equal package.json). */
export function checkOrder(version: string, released: string[]) {
  const ahead = released.find((v) => Bun.semver.order(version, v) <= 0);
  if (ahead) throw new Error(`${version} is not newer than ${ahead}, which is already in CHANGELOG.md`);
}

export function gitSteps(version: string) {
  return [
    "git add package.json CHANGELOG.md",
    `git commit -m "Release v${version}"`,
    `git tag -a v${version} -m "ARGUS ${version}"`,
    "git push origin main --follow-tags",
  ];
}

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** `root` holds package.json and CHANGELOG.md. Output goes through `log` so tests can read it. */
export async function main(args: string[], root = ROOT, log = console.log) {
  const pkgFile = Bun.file(`${root}package.json`);
  const logFile = Bun.file(`${root}CHANGELOG.md`);
  const pkg = await pkgFile.json();
  const changelog = await logFile.text();

  if (args[0] === "notes") {
    const version = args[1];
    if (pkg.version !== version) throw new Error(`Tag v${version} does not match package.json ${pkg.version}`);
    log(notesFor(changelog, version));
    return;
  }

  const version = nextVersion(pkg.version, args[0] ?? "");
  checkOrder(version, releasedVersions(changelog));
  const date = new Date().toISOString().slice(0, 10);
  const cut = cutChangelog(changelog, version, date);

  if (!args.includes("--skip-checks")) await $`bun run check`.cwd(root);
  await logFile.write(cut);
  await pkgFile.write(JSON.stringify({ ...pkg, version }, null, 2) + "\n");

  log(`\nPrepared v${version}. Review the diff, then a maintainer runs:\n`);
  for (const step of gitSteps(version)) log(`  ${step}`);
  log("\nPushing the tag starts .github/workflows/release.yml.");
}
