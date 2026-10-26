import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkOrder, cutChangelog, gitSteps, main, nextVersion, notesFor, releasedVersions } from "../../scripts/release-lib";

const LOG = `# Changelog

## [Unreleased]

### Added
- Flows

## [0.1.0] - 2026-11-01

### Added
- First release
`;

describe("release script", () => {
  test("next version from an explicit version or a bump", () => {
    expect(nextVersion("0.1.0", "0.2.0-rc.1")).toBe("0.2.0-rc.1");
    expect(nextVersion("0.1.3-rc.1", "patch")).toBe("0.1.4");
    expect(nextVersion("0.1.3", "minor")).toBe("0.2.0");
    expect(nextVersion("0.1.3", "major")).toBe("1.0.0");
    expect(() => nextVersion("0.1.0", "")).toThrow("Give a version like 0.1.0 or one of: patch, minor, major");
  });

  test("cuts Unreleased into a dated section", () => {
    expect(releasedVersions(LOG)).toEqual(["0.1.0"]);
    const cut = cutChangelog(LOG, "0.2.0", "2026-12-01");
    expect(cut).toContain("## [Unreleased]\n\n## [0.2.0] - 2026-12-01\n\n### Added\n- Flows\n\n## [0.1.0]");
    expect(notesFor(cut, "0.2.0")).toBe("### Added\n- Flows");
    const last = cutChangelog("## [Unreleased]\n- only\n", "0.1.0", "2026-11-01");
    expect(last).toBe("## [Unreleased]\n\n## [0.1.0] - 2026-11-01\n\n- only\n");
  });

  test("refuses what would make a bad release", () => {
    expect(() => cutChangelog(LOG, "0.1.0", "x")).toThrow("CHANGELOG.md already has 0.1.0");
    expect(() => cutChangelog("# Changelog\n", "0.1.0", "x")).toThrow('no "## [Unreleased]" section');
    expect(() => cutChangelog("## [Unreleased]\n\n## [0.1.0]\n", "0.2.0", "x")).toThrow("Nothing under Unreleased");
    expect(() => notesFor(LOG, "9.9.9")).toThrow("CHANGELOG.md has no section for 9.9.9");
    expect(() => checkOrder("0.1.0", ["0.1.0"])).toThrow("0.1.0 is not newer than 0.1.0");
    expect(() => checkOrder("0.1.0-rc.1", ["0.1.0"])).toThrow();
    expect(() => checkOrder("0.1.1", ["0.1.0"])).not.toThrow();
    expect(notesFor(LOG, "0.1.0")).toBe("### Added\n- First release");
  });

  test("only prints git steps, with no co-author lines", () => {
    const steps = gitSteps("0.1.0");
    expect(steps).toContain('git tag -a v0.1.0 -m "ARGUS 0.1.0"');
    expect(steps.join("\n")).not.toMatch(/co-authored|claude/i);
  });
});

describe("release cli", () => {
  async function inTemp(version: string, changelog: string, run: (dir: string, out: string[]) => Promise<void>) {
    const dir = await mkdtemp(join(tmpdir(), "argus-release-"));
    try {
      await Bun.write(join(dir, "package.json"), JSON.stringify({ name: "x", version }));
      await Bun.write(join(dir, "CHANGELOG.md"), changelog);
      await run(dir + "/", []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const version = async (dir: string) => (await Bun.file(join(dir, "package.json")).json()).version;

  test("prepares the first release and prints its notes, without touching git", async () => {
    await inTemp("0.1.0", "# Changelog\n\n## [Unreleased]\n\n- First\n", async (dir, out) => {
      await main(["0.1.0", "--skip-checks"], dir, (l) => out.push(l));
      expect(await Bun.file(join(dir, "CHANGELOG.md")).text()).toContain("## [0.1.0] - ");
      expect(await version(dir)).toBe("0.1.0");
      expect(out.join("\n")).toContain("git push origin main --follow-tags");
      out.length = 0;
      await main(["notes", "0.1.0"], dir, (l) => out.push(l));
      expect(out).toEqual(["- First"]);
      expect(main(["notes", "0.2.0"], dir)).rejects.toThrow("Tag v0.2.0 does not match package.json 0.1.0");
    });
  });

  test("bumps, and writes nothing when the checks fail", async () => {
    await inTemp("0.1.0", "## [Unreleased]\n- Next\n\n## [0.1.0] - 2026-11-01\n- First\n", async (dir) => {
      // The temp package has no "check" script, so the checks fail before anything is written.
      expect(main(["minor"], dir, () => {})).rejects.toThrow();
      expect(await version(dir)).toBe("0.1.0");
      await main(["minor", "--skip-checks"], dir, () => {});
      expect(await version(dir)).toBe("0.2.0");
    });
  });
});
