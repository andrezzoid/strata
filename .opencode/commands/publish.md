---
description: Finalize notes, tag, publish, and create a GitHub release
---

Publish a new strata release. Treat this as a release operation: be conservative, verify every step, and stop rather than guessing when release state is ambiguous.

Release argument:

- If `$ARGUMENTS` includes a version, use it as the intended version after validating it against the changelog and package metadata.
- If no version is provided, infer the version from the current unreleased changelog section and package metadata.
- Everywhere below, replace `vX.X.X` with the tag version including the `v` prefix, `X.X.X` with the package/changelog version without the prefix, and `YYYY-MM-DD` with today's date.

Workflow:

1. Inspect current state before editing.
   - Run `git status --short`.
   - Run `git log --oneline --decorate --no-merges $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD` to see commits since the previous tag, falling back to repository start if no tag exists.
   - Read `CHANGELOG.md` and `package.json`.
   - Stop if the worktree has unrelated changes that would make a release commit unsafe; ask what to include rather than sweeping them in.

2. Cross-check release notes.
   - Compare commits since the previous tag with the current unreleased section in `CHANGELOG.md`.
   - Add missing user-visible changes to the unreleased section.
   - Do not include internal-only deltas unless they changed the package, CLI behavior, docs, or release surface.

3. Determine the release version.
   - Use the existing unreleased changelog heading and `package.json.version` as the source of truth.
   - If they disagree, stop and ask which version is correct.
   - Use semantic versioning: patch for fixes/docs/release packaging, minor for new user-visible functionality, major for breaking changes.

4. Finalize release notes before publishing.
   - Change the current `X.X.X - Unreleased` or `vX.X.X - Unreleased` heading in `CHANGELOG.md` to `X.X.X - YYYY-MM-DD`.
   - Keep the version format consistent with the existing changelog.
   - Add a new topmost unreleased section for the next patch version, e.g. `## X.X.(X+1) - Unreleased`, unless the project uses another explicit changelog convention.
   - Make sure the finalized section is suitable for GitHub Release notes.

5. Commit only the release-note change.
   - Stage only `CHANGELOG.md` unless version metadata also had to be corrected deliberately.
   - Commit with an extremely concise message, e.g. `Finalize X.X.X release notes`.
   - Include the required co-author trailer.

6. Confirm clean release state and rerun verification.
   - Run `git status --short` and stop if it is not clean.
   - Run `bun install --frozen-lockfile`.
   - Run `bun run typecheck`.
   - Run `bun run test`.
   - Run `bun src/cli.ts src --format json` and require zero source findings or explicitly justified candidates.
   - Run `bun publish --dry-run` and confirm the tarball contains only expected release files.

7. Tag the exact release commit.
   - Run `git tag vX.X.X` on the verified clean commit.
   - If the tag already exists, stop and ask. Do not move or delete release tags without explicit approval.

8. Publish from that exact clean commit.
   - Run `bun publish --access public`.
   - If Bun reports missing authentication, tell the operator to provide `NPM_CONFIG_TOKEN` for this shell or run npm login again; do not switch to `npm publish` unless the package bin compatibility has been verified for npm.
   - If OTP is required, ask for it or use a provided `--otp` value.

9. Push commit and tag.
   - Run `git push origin HEAD`.
   - Run `git push origin vX.X.X`.
   - Do not force-push.

10. Create the GitHub Release.
    - Extract the finalized `X.X.X - YYYY-MM-DD` changelog section.
    - Run `gh release create vX.X.X --title "vX.X.X" --notes-file <temp-notes-file>` using the extracted section as release notes.
    - Return the GitHub Release URL.

Failure handling:

- If publish succeeds but pushing or GitHub Release creation fails, report exactly what shipped and what remains to finish.
- If publish fails before the registry accepts the package, do not move the tag or create the GitHub Release.
- Never publish from a dirty worktree or from a commit different from the release tag.
- Never amend, move tags, force-push, or delete published versions without explicit approval.
