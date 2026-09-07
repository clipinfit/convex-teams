# Release convex-teams

The source package starts at `0.1.0-alpha.0`. Keep unfinished APIs on the `alpha` distribution tag. Use `latest` only for a release that passes the full component and consumer validation plan.

During `0.x`, use a minor version for incompatible API or schema changes. Use a patch version for compatible fixes. Record every user-visible change in `CHANGELOG.md`. Bump once for each published artifact, not for each checkpoint commit.

## Create checkpoints

Commit a coherent change after its checks pass. Use a short conventional commit message. Push checkpoints to GitHub. Do not use version tags for unfinished checkpoints.

## Publish the name claim

The initial claim has version `0.0.0-development.0`. It includes no component runtime. Inspect and publish this exact artifact:

```sh
npm pack ./release/claim --dry-run
npm publish ./release/claim --tag development --access public
npm view convex-teams@0.0.0-development.0 version dist-tags repository
```

Complete npm browser sign-in or 2FA locally when requested. Never commit npm credentials. Record the confirmed version and registry integrity in the PRD. Create the matching Git tag only after npm confirms publication.

## Publish a component prerelease

1. Replace the invite patch with a corrected published dependency. A downstream install cannot rely on this repository's Bun patch.
2. Complete the required PRD tests, the consumer rehearsal, and a clean packed installation.
3. Update `CHANGELOG.md`. For a subsequent alpha, run `bun run version:alpha`. Review both `package.json` and `bun.lock`.
4. Run the checks below. Commit and push the release candidate.
5. Publish with `npm publish --tag alpha --access public`.
6. Verify the registry version and integrity. Tag that exact commit as `v<version>` and push the tag.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
bun run pack:check
```

`prepublishOnly` rejects the source package while it has a dependency patch or uncommitted changes. This guard is only a mechanical check. It does not establish consumer readiness. Do not bypass it to publish the component.

Published versions are immutable. Prepare a new version to correct a published artifact. See [npm's publication rules](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
