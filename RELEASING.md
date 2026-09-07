# Release convex-teams

The first stable target is `1.0.0`, preceded by `1.0.0-rc.0` under the `next` tag. Keep unfinished APIs on a prerelease tag. Move `latest` only after the component and consumer validation plan passes. After 1.0, incompatible API or documented authorization changes require a major version; compatible additions require a minor version and compatible fixes require a patch.

The first name-claim publication received both `development` and `latest` from npm. The registry rejected removal of `latest` with HTTP 400. Both currently identify the notice-only package, not a working component.

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

1. Use published dependencies without local patches. Teams now uses the corrected `convex-invite@0.1.1` release.
2. Complete the required PRD tests, the consumer rehearsal, and a clean packed installation.
3. Update `CHANGELOG.md`. For a subsequent alpha, run `bun run version:alpha`. Review `packages/convex-teams/package.json` and the root `bun.lock`.
4. Run the checks below. Commit and push the release candidate.
5. From `packages/convex-teams`, publish with `npm publish --tag alpha --access public`.
6. Verify the registry version and integrity. Tag that exact commit as `v<version>` and push the tag.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
bun run pack:check
bun run pack:smoke
```

`prepublishOnly` rejects the source package while it has a dependency patch or uncommitted changes. This guard is only a mechanical check. It does not establish consumer readiness. Do not bypass it to publish the component.

Published versions are immutable. Prepare a new version to correct a published artifact. See [npm's publication rules](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

## Verify an installed component

Run `bun run pack:smoke` to build the package and install its archive in a fresh temporary npm project. The check validates exported types, the test registration helper, the mounted component tree, invitation pagination, and acceptance rollback on a local Convex backend. It requires Node.js, npm, and access to download the Convex backend. The temporary project is retained for inspection.

The registry-only check uses the published `convex-invite@0.1.1` dependency. To evaluate a future unpublished invite correction, pass an archive whose version satisfies the teams dependency:

```sh
bun run pack:smoke /absolute/path/convex-invite-candidate.tgz
```

A candidate result validates that archive only. Before publication, run `bun run pack:smoke` without an argument. A local candidate does not satisfy this release gate.

## Monorepo package boundaries

The repository root is private. Publish only from `packages/convex-teams`. Keep its `CHANGELOG.md` and `LICENSE` synchronized with the root copies before a release. The package README uses GitHub links so they also work on npm.

The invite development patch was removed after `convex-invite@0.1.1` was published. The component publication guard still rejects workspace dependency patches and uncommitted changes. Website deployments do not publish an npm package.

## First stable promotion

Run the final checks on the release candidate and commit it. Publish `1.0.0-rc.0` with `npm publish --tag next --access public` from the component package. Verify its registry version and integrity, then install that exact registry version in the clean consumer checks.

After those checks pass, set the version to `1.0.0`, update documentation and both changelogs, and repeat the final build and package checks. Publish with `npm publish --tag latest --access public`. Verify integrity and tags before creating the matching Git tag and GitHub release. Publication does not perform a consumer production cutover.

To test a registry release instead of a local archive:

```sh
TEAMS_RELEASE_VERSION=1.0.0-rc.0 bun run pack:smoke
TEAMS_RELEASE_VERSION=1.0.0-rc.0 node scripts/rehearse-consumer.mjs pedalclass
TEAMS_RELEASE_VERSION=1.0.0-rc.0 node scripts/rehearse-consumer.mjs feedtwin
```

Use the exact version under verification. The scripts reject version ranges.
