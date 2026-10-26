# Releasing

ARGUS follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor bump (0.x.0) may break
things and a patch (0.x.y) only fixes them. The version lives in `package.json`. The notes live in
`CHANGELOG.md`.

## Day to day

1. Work on a branch and open a pull request into `main`.
2. CI (`.github/workflows/ci.yml`) runs on every push and pull request:
   - **check**: `bun install --frozen-lockfile`, lint, typecheck, then `bun run test:coverage` with the
     95% gate. The lcov report is uploaded as the `coverage` artifact.
   - **build**: `bun run build` with placeholder env vars. The build never connects to them.
3. Add a line under `## [Unreleased]` in `CHANGELOG.md` for anything a user would notice.
4. Merge when CI is green.

Run the same checks locally with `bun run check` (and `bun run build`).

## Cutting a release

```sh
bun run release 0.1.0       # or: patch | minor | major, or a prerelease like 0.2.0-rc.1
```

The script (`scripts/release.ts`):

1. Works out the version and refuses one that is not newer than every version in `CHANGELOG.md`.
2. Refuses if nothing is written under Unreleased.
3. Runs `bun run check` (`--skip-checks` skips it, only when CI has just run on the same commit).
4. Moves Unreleased into `## [x.y.z] - YYYY-MM-DD` and sets `package.json` to that version.
5. Prints the git commands. **It never commits, tags or pushes.**

A maintainer reviews the diff and runs the printed commands:

```sh
git add package.json CHANGELOG.md
git commit -m "Release v0.1.0"
git tag -a v0.1.0 -m "ARGUS 0.1.0"
git push origin main --follow-tags
```

Pushing the `v*.*.*` tag starts `.github/workflows/release.yml`. It reruns the full CI, checks that the
tag matches `package.json` and has a `CHANGELOG.md` section, and publishes a GitHub Release with that
section as the notes. A version with a suffix (`-rc.1`) is published as a prerelease.

## If something goes wrong

- **CI failed on the tag:** nothing was published. Fix the problem on `main`, delete the tag
  (`git push --delete origin v0.1.0`, then `git tag -d v0.1.0`), and release again.
- **A bad release went out:** never move a published tag. Ship the fix as the next patch.

## Deploying

0.1.0 is released as source on GitHub. Deploying it (env vars from `.env.example`, `bun run db:migrate`,
then `bun run build` and `bun run start`) is a manual step, listed in `docs/version-map/0.1.0.md`.
